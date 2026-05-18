"""Podcast Index API client with disk caching."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path

import httpx

log = logging.getLogger("okaasan.podcasts.metadata")

PODCAST_INDEX_BASE = "https://api.podcastindex.org/api/1.0"
CACHE_TTL_SEARCH = 3600          # 1 hour for search results
CACHE_TTL_FEED = 24 * 60 * 60   # 24 hours for podcast/episode info


class PodcastIndexClient:
    """Client for the Podcast Index API with local disk caching."""

    def __init__(self, cache_dir: Path, covers_dir: Path, api_key: str = "", api_secret: str = ""):
        self.api_key = api_key
        self.api_secret = api_secret
        self.cache_dir = cache_dir
        self.covers_dir = covers_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.covers_dir.mkdir(parents=True, exist_ok=True)

        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        self._http = httpx.Client(
            timeout=15.0,
            transport=transport,
            headers={"User-Agent": "Okaasan/1.0"},
        )

    @property
    def available(self) -> bool:
        return bool(self.api_key and self.api_secret)

    def _auth_headers(self) -> dict[str, str]:
        """Generate Podcast Index auth headers (key + date + sha1(key+secret+epoch))."""
        epoch = str(int(time.time()))
        data = self.api_key + self.api_secret + epoch
        sha1_hash = hashlib.sha1(data.encode("utf-8")).hexdigest()
        return {
            "X-Auth-Key": self.api_key,
            "X-Auth-Date": epoch,
            "Authorization": sha1_hash,
        }

    def _cache_path(self, category: str, key: str) -> Path:
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return self.cache_dir / category / f"{safe_key}.json"

    def _read_cache(self, category: str, key: str, ttl: int) -> dict | None:
        path = self._cache_path(category, key)
        if not path.exists():
            return None
        try:
            mtime = path.stat().st_mtime
            if time.time() - mtime > ttl:
                return None
            with open(path) as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    def _write_cache(self, category: str, key: str, data: dict):
        path = self._cache_path(category, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def _api_request(self, endpoint: str, params: dict | None = None) -> dict | None:
        if not self.available:
            return None

        url = f"{PODCAST_INDEX_BASE}{endpoint}"
        headers = self._auth_headers()
        try:
            t0 = time.monotonic()
            resp = self._http.get(url, params=params or {}, headers=headers)
            elapsed = (time.monotonic() - t0) * 1000
            resp.raise_for_status()
            log.info("PodcastIndex %s completed in %.0fms (status %d)", endpoint, elapsed, resp.status_code)
            return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("PodcastIndex %s failed: %s", endpoint, e)
            return None

    def search(self, query: str) -> list[dict]:
        """Search podcasts by term."""
        cache_key = f"search-{query}"
        cached = self._read_cache("search", cache_key, CACHE_TTL_SEARCH)
        if cached is not None:
            return cached.get("feeds", [])

        data = self._api_request("/search/byterm", params={"q": query})
        if data:
            self._write_cache("search", cache_key, data)
            return data.get("feeds", [])
        return []

    def get_feed(self, feed_id: int) -> dict | None:
        """Get podcast info by Podcast Index feed ID."""
        cache_key = f"feed-{feed_id}"
        cached = self._read_cache("feed", cache_key, CACHE_TTL_FEED)
        if cached is not None:
            return cached.get("feed")

        data = self._api_request("/podcasts/byfeedid", params={"id": feed_id})
        if data:
            self._write_cache("feed", cache_key, data)
            return data.get("feed")
        return None

    def get_episodes(self, feed_id: int, max_results: int = 100) -> list[dict]:
        """Get episodes for a feed by Podcast Index feed ID."""
        cache_key = f"episodes-{feed_id}"
        cached = self._read_cache("episodes", cache_key, CACHE_TTL_FEED)
        if cached is not None:
            return cached.get("items", [])

        data = self._api_request(
            "/episodes/byfeedid",
            params={"id": feed_id, "max": max_results},
        )
        if data:
            self._write_cache("episodes", cache_key, data)
            return data.get("items", [])
        return []

    def download_cover(self, image_url: str, podcast_id: int) -> str | None:
        """Download a podcast cover image and return the relative path."""
        if not image_url:
            return None

        ext = Path(image_url).suffix.split("?")[0] or ".jpg"
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        local_file = self.covers_dir / f"podcast-{podcast_id}{ext}"

        if local_file.exists():
            return str(local_file.relative_to(self.covers_dir.parent.parent))

        try:
            resp = self._http.get(image_url, follow_redirects=True)
            resp.raise_for_status()
            local_file.write_bytes(resp.content)
            return str(local_file.relative_to(self.covers_dir.parent.parent))
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            log.warning("Failed to download podcast cover %s: %s", image_url, e)
            return None
