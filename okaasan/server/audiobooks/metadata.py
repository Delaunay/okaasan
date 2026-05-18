"""Audnexus metadata client with disk caching."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path

import httpx

log = logging.getLogger("okaasan.audiobooks.metadata")

_AUDNEXUS_BASE = "https://api.audnex.us"
_SEARCH_CACHE_TTL = 86400  # 24 hours
_BOOK_CACHE_TTL = 0  # forever


class AudnexusClient:
    """Client for the Audnexus API with disk-based caching."""

    def __init__(self, cache_dir: Path, covers_dir: Path):
        self.cache_dir = cache_dir
        self.covers_dir = covers_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.covers_dir.mkdir(parents=True, exist_ok=True)
        self._transport = httpx.HTTPTransport(local_address="0.0.0.0")

    def _client(self) -> httpx.Client:
        return httpx.Client(transport=self._transport, timeout=30)

    def _cache_path(self, namespace: str, key: str) -> Path:
        safe_key = hashlib.sha256(key.encode()).hexdigest()
        return self.cache_dir / namespace / f"{safe_key}.json"

    def _read_cache(self, namespace: str, key: str, ttl: int = 0) -> dict | None:
        path = self._cache_path(namespace, key)
        if not path.is_file():
            return None
        try:
            data = json.loads(path.read_text())
            if ttl > 0:
                cached_at = data.get("_cached_at", 0)
                if time.time() - cached_at > ttl:
                    return None
            return data.get("payload")
        except (json.JSONDecodeError, OSError):
            return None

    def _write_cache(self, namespace: str, key: str, payload: dict | list) -> None:
        path = self._cache_path(namespace, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {"_cached_at": time.time(), "payload": payload}
        path.write_text(json.dumps(data, indent=2))

    def search_book(self, title: str, author: str | None = None) -> list[dict]:
        """Search for books by title and optionally author."""
        cache_key = f"{title}|{author or ''}"
        cached = self._read_cache("search", cache_key, ttl=_SEARCH_CACHE_TTL)
        if cached is not None:
            return cached

        params = {"title": title}
        if author:
            params["author"] = author

        try:
            with self._client() as client:
                resp = client.get(f"{_AUDNEXUS_BASE}/books", params=params)
                resp.raise_for_status()
                results = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            log.warning("Audnexus search failed for %r: %s", title, e)
            return []

        self._write_cache("search", cache_key, results)
        return results

    def get_book(self, asin: str) -> dict | None:
        """Get book details by ASIN."""
        cached = self._read_cache("books", asin, ttl=_BOOK_CACHE_TTL)
        if cached is not None:
            return cached

        try:
            with self._client() as client:
                resp = client.get(f"{_AUDNEXUS_BASE}/books/{asin}")
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            log.warning("Audnexus get_book failed for %s: %s", asin, e)
            return None

        self._write_cache("books", asin, data)
        return data

    def get_chapters(self, asin: str) -> list[dict]:
        """Get chapter info for a book by ASIN."""
        cache_key = f"chapters_{asin}"
        cached = self._read_cache("chapters", cache_key, ttl=_BOOK_CACHE_TTL)
        if cached is not None:
            return cached

        try:
            with self._client() as client:
                resp = client.get(f"{_AUDNEXUS_BASE}/books/{asin}/chapters")
                resp.raise_for_status()
                data = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            log.warning("Audnexus get_chapters failed for %s: %s", asin, e)
            return []

        chapters = data.get("chapters", data) if isinstance(data, dict) else data
        self._write_cache("chapters", cache_key, chapters)
        return chapters

    def get_cover(self, asin: str, cover_url: str) -> str | None:
        """Download cover image and save to covers directory. Returns relative path."""
        ext = "jpg"
        if "." in cover_url.rsplit("/", 1)[-1]:
            ext = cover_url.rsplit(".", 1)[-1].split("?")[0][:4]

        filename = f"{asin}.{ext}"
        dest = self.covers_dir / filename

        if dest.is_file():
            return f"/uploads/data/audiobooks/covers/{filename}"

        try:
            with self._client() as client:
                resp = client.get(cover_url, follow_redirects=True)
                resp.raise_for_status()
                dest.write_bytes(resp.content)
        except (httpx.HTTPError, OSError) as e:
            log.warning("Cover download failed for %s: %s", asin, e)
            return None

        return f"/uploads/data/audiobooks/covers/{filename}"
