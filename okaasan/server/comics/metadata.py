"""ComicVine + AniList metadata clients with disk caching."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("okaasan.comics.metadata")

COMICVINE_API_BASE = "https://comicvine.gamespot.com/api"
ANILIST_API_URL = "https://graphql.anilist.co"

ANILIST_SEARCH_QUERY = """
query ($search: String) {
  Page(perPage: 10) {
    media(search: $search, type: MANGA) {
      id
      title { romaji english }
      coverImage { large }
      description
      genres
      chapters
    }
  }
}
"""


def _cache_path(cache_dir: Path, key: str) -> Path:
    safe = hashlib.md5(key.encode()).hexdigest()
    return cache_dir / f"{safe}.json"


def _read_cache(cache_dir: Path, key: str, ttl: int = 7 * 24 * 3600) -> dict | None:
    path = _cache_path(cache_dir, key)
    if not path.exists():
        return None
    try:
        if ttl > 0:
            age = time.time() - path.stat().st_mtime
            if age > ttl:
                return None
        with open(path) as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def _write_cache(cache_dir: Path, key: str, data: Any):
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = _cache_path(cache_dir, key)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _load_api_key(static_folder: str) -> str | None:
    config_path = Path(static_folder) / "private" / "_comics.json"
    if not config_path.is_file():
        return None
    try:
        with open(config_path) as f:
            cfg = json.load(f)
        return cfg.get("comicvine_api_key")
    except (json.JSONDecodeError, OSError):
        return None


def _make_http() -> httpx.Client:
    transport = httpx.HTTPTransport(local_address="0.0.0.0")
    return httpx.Client(
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
            "Accept": "application/json",
        },
        timeout=15.0,
        transport=transport,
    )


class ComicVineClient:
    """ComicVine API client with disk cache and rate limiting (~3 req/sec)."""

    def __init__(self, api_key: str, cache_dir: Path):
        self.api_key = api_key
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._http = _make_http()
        self._last_request = 0.0

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _throttle(self):
        elapsed = time.monotonic() - self._last_request
        if elapsed < 0.34:
            time.sleep(0.34 - elapsed)
        self._last_request = time.monotonic()

    def search_comicvine(self, title: str) -> list[dict]:
        cache_key = f"cv-search-{title.lower().strip()}"
        cached = _read_cache(self.cache_dir, cache_key, ttl=24 * 3600)
        if cached is not None:
            return cached

        if not self.available:
            return []

        self._throttle()
        try:
            resp = self._http.get(
                f"{COMICVINE_API_BASE}/search/",
                params={
                    "api_key": self.api_key,
                    "format": "json",
                    "resources": "volume",
                    "query": title,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            _write_cache(self.cache_dir, cache_key, results)
            return results
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("ComicVine search failed for %r: %s", title, e)
            return []

    def get_volume(self, volume_id: int) -> dict | None:
        cache_key = f"cv-volume-{volume_id}"
        cached = _read_cache(self.cache_dir, cache_key, ttl=30 * 24 * 3600)
        if cached is not None:
            return cached

        if not self.available:
            return None

        self._throttle()
        try:
            resp = self._http.get(
                f"{COMICVINE_API_BASE}/volume/4050-{volume_id}/",
                params={"api_key": self.api_key, "format": "json"},
            )
            resp.raise_for_status()
            data = resp.json()
            result = data.get("results")
            if result:
                _write_cache(self.cache_dir, cache_key, result)
            return result
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("ComicVine get_volume(%d) failed: %s", volume_id, e)
            return None

    def get_issue(self, issue_id: int) -> dict | None:
        cache_key = f"cv-issue-{issue_id}"
        cached = _read_cache(self.cache_dir, cache_key, ttl=30 * 24 * 3600)
        if cached is not None:
            return cached

        if not self.available:
            return None

        self._throttle()
        try:
            resp = self._http.get(
                f"{COMICVINE_API_BASE}/issue/4000-{issue_id}/",
                params={"api_key": self.api_key, "format": "json"},
            )
            resp.raise_for_status()
            data = resp.json()
            result = data.get("results")
            if result:
                _write_cache(self.cache_dir, cache_key, result)
            return result
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("ComicVine get_issue(%d) failed: %s", issue_id, e)
            return None


class AniListClient:
    """AniList GraphQL client for manga metadata."""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._http = _make_http()

    def search_anilist(self, title: str) -> list[dict]:
        cache_key = f"al-search-{title.lower().strip()}"
        cached = _read_cache(self.cache_dir, cache_key, ttl=24 * 3600)
        if cached is not None:
            return cached

        try:
            resp = self._http.post(
                ANILIST_API_URL,
                json={"query": ANILIST_SEARCH_QUERY, "variables": {"search": title}},
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("data", {}).get("Page", {}).get("media", [])
            _write_cache(self.cache_dir, cache_key, results)
            return results
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("AniList search failed for %r: %s", title, e)
            return []


def download_cover(url: str, covers_dir: Path, filename: str) -> str | None:
    """Download a cover image and return the relative path under uploads/."""
    covers_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(url).suffix or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        ext = ".jpg"
    dest = covers_dir / f"{filename}{ext}"
    if dest.exists():
        try:
            rel = dest.relative_to(covers_dir.parent.parent.parent)
            return str(rel)
        except ValueError:
            return str(dest)

    try:
        http = _make_http()
        resp = http.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        try:
            rel = dest.relative_to(covers_dir.parent.parent.parent)
            return str(rel)
        except ValueError:
            return str(dest)
    except (httpx.HTTPStatusError, httpx.RequestError) as e:
        log.warning("Failed to download cover %s: %s", url, e)
        return None
