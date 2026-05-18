"""Open Library API client with disk caching."""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("okaasan.books.metadata")

OL_BASE = "https://openlibrary.org"
OL_COVERS = "https://covers.openlibrary.org"
USER_AGENT = "Okaasan/1.0 (personal library)"
CACHE_TTL_SEARCH = 24 * 60 * 60  # 24 hours
CACHE_TTL_WORK = 0  # books never expire


class OpenLibraryClient:
    """Open Library API client with local disk caching for metadata and covers."""

    def __init__(self, data_dir: Path):
        self.data_dir = data_dir
        self.cache_dir = data_dir / "ol_cache"
        self.covers_dir = data_dir / "covers"
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.covers_dir.mkdir(parents=True, exist_ok=True)

        self._rate_lock = threading.Lock()
        self._last_request: float = 0.0

        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        self._http = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=15.0,
            transport=transport,
        )

    def _cache_path(self, category: str, key: str) -> Path:
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return self.cache_dir / category / f"{safe_key}.json"

    def _read_cache(self, category: str, key: str, ttl: int = 0) -> dict | None:
        path = self._cache_path(category, key)
        if not path.exists():
            return None
        try:
            if ttl > 0:
                mtime = path.stat().st_mtime
                if time.time() - mtime > ttl:
                    return None
            with open(path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    def _write_cache(self, category: str, key: str, data: Any):
        path = self._cache_path(category, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def _throttle(self):
        """Enforce 1 request per second rate limit."""
        with self._rate_lock:
            now = time.monotonic()
            elapsed = now - self._last_request
            if elapsed < 1.0:
                time.sleep(1.0 - elapsed)
            self._last_request = time.monotonic()

    def _get(self, url: str, params: dict | None = None) -> dict | None:
        self._throttle()
        try:
            resp = self._http.get(url, params=params)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("Open Library request failed %s: %s", url, e)
            return None

    def search(self, title: str, author: str | None = None) -> list[dict]:
        """Search Open Library for books by title and optional author."""
        cache_key = f"search-{title}-{author or ''}"
        cached = self._read_cache("search", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached.get("docs", []) if isinstance(cached, dict) else cached

        params: dict[str, str] = {"q": title, "limit": "20"}
        if author:
            params["author"] = author

        data = self._get(f"{OL_BASE}/search.json", params=params)
        if data:
            self._write_cache("search", cache_key, data)
            return data.get("docs", [])
        return []

    def get_work(self, olid: str) -> dict | None:
        """Get work details by Open Library work ID (e.g. OL12345W)."""
        cache_key = f"work-{olid}"
        cached = self._read_cache("works", cache_key, ttl=CACHE_TTL_WORK)
        if cached is not None:
            return cached

        data = self._get(f"{OL_BASE}/works/{olid}.json")
        if data:
            self._write_cache("works", cache_key, data)
        return data

    def get_cover(self, isbn_or_olid: str, size: str = "M") -> str | None:
        """Download a cover image and return the local path relative to data_dir.

        Tries ISBN first, falls back to OLID cover.
        """
        filename = f"{isbn_or_olid}-{size}.jpg"
        local_path = self.covers_dir / filename

        if local_path.exists():
            return str(local_path.relative_to(self.data_dir.parent.parent))

        # Try ISBN-based URL
        url = f"{OL_COVERS}/b/isbn/{isbn_or_olid}-{size}.jpg"
        if not self._download_cover(url, local_path):
            # Fallback: try OLID-based URL
            url = f"{OL_COVERS}/b/olid/{isbn_or_olid}-{size}.jpg"
            if not self._download_cover(url, local_path):
                return None

        return str(local_path.relative_to(self.data_dir.parent.parent))

    def _download_cover(self, url: str, local_path: Path) -> bool:
        """Download an image to local_path. Returns True on success."""
        self._throttle()
        try:
            resp = self._http.get(url, follow_redirects=True)
            resp.raise_for_status()
            if len(resp.content) < 100:
                return False
            local_path.write_bytes(resp.content)
            return True
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            log.warning("Failed to download cover %s: %s", url, e)
            return False
