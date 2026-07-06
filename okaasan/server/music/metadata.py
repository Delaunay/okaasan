"""MusicBrainz + Cover Art Archive client with aggressive disk caching."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("okaasan.music.metadata")

MB_API_BASE = "https://musicbrainz.org/ws/2"
COVER_ART_BASE = "https://coverartarchive.org"

CACHE_TTL_SEARCH = 24 * 60 * 60  # 24 hours for search results
CACHE_TTL_RELEASE = 0            # releases never expire
MAX_REQUESTS_PER_SECOND = 1


class MusicBrainzClient:
    """MusicBrainz API client with local disk caching."""

    def __init__(self, cache_dir: Path, covers_dir: Path):
        self.cache_dir = cache_dir
        self.covers_dir = covers_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.covers_dir.mkdir(parents=True, exist_ok=True)
        self._rate_lock = threading.Lock()
        self._last_request: float = 0.0

        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        self._http = httpx.Client(
            headers={
                "Accept": "application/json",
                "User-Agent": "Okaasan/1.0 (personal music library manager)",
            },
            timeout=15.0,
            transport=transport,
        )

    def _cache_path(self, category: str, key: str) -> Path:
        safe_key = hashlib.md5(key.encode()).hexdigest()
        subdir = self.cache_dir / category
        subdir.mkdir(parents=True, exist_ok=True)
        return subdir / f"{safe_key}.json"

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

    def _write_cache(self, category: str, key: str, data: dict):
        path = self._cache_path(category, key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

    def _throttle(self):
        """Block until at least 1 second since last request."""
        with self._rate_lock:
            now = time.monotonic()
            elapsed = now - self._last_request
            if elapsed < 1.0:
                time.sleep(1.0 - elapsed)
            self._last_request = time.monotonic()

    def _api_request(self, endpoint: str, params: dict[str, Any] | None = None) -> dict | None:
        self._throttle()
        url = f"{MB_API_BASE}{endpoint}"
        query = params.copy() if params else {}
        query["fmt"] = "json"

        try:
            t0 = time.monotonic()
            resp = self._http.get(url, params=query)
            elapsed = (time.monotonic() - t0) * 1000
            resp.raise_for_status()
            log.info("MusicBrainz %s completed in %.0fms (status %d)", endpoint, elapsed, resp.status_code)
            return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("MusicBrainz %s failed: %s", endpoint, e)
            return None

    def search_recording(self, title: str, artist: str | None = None) -> dict | None:
        """Search MusicBrainz for a recording by title and optional artist."""
        parts = [f'recording:"{title}"']
        if artist:
            parts.append(f'artist:"{artist}"')
        query = " AND ".join(parts)

        cache_key = f"search-{query}"
        cached = self._read_cache("search", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached

        data = self._api_request("/recording", {"query": query, "limit": "10"})
        if data:
            self._write_cache("search", cache_key, data)
        return data

    def search_release(self, album: str, artist: str | None = None) -> dict | None:
        """Search MusicBrainz for a release (album) by name and optional artist."""
        parts = [f'release:"{album}"']
        if artist:
            parts.append(f'artist:"{artist}"')
        query = " AND ".join(parts)

        cache_key = f"release-search-{query}"
        cached = self._read_cache("search", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached

        data = self._api_request("/release", {"query": query, "limit": "10"})
        if data:
            self._write_cache("search", cache_key, data)
        return data

    def get_release(self, mbid: str) -> dict | None:
        """Get release details by MusicBrainz ID."""
        cache_key = f"release-{mbid}"
        cached = self._read_cache("release", cache_key, ttl=CACHE_TTL_RELEASE)
        if cached is not None:
            return cached

        data = self._api_request(f"/release/{mbid}", {"inc": "recordings+artists+release-groups"})
        if data:
            self._write_cache("release", cache_key, data)
        return data

    def get_cover_art(self, mbid: str) -> str | None:
        """Download cover art from Cover Art Archive, save locally.

        Returns relative path to the cover image, or None.
        404s are cached as empty marker files to avoid repeated lookups.
        """
        local_file = self.covers_dir / f"{mbid}.jpg"
        if local_file.exists():
            return str(local_file) if local_file.stat().st_size > 0 else None
        local_png = self.covers_dir / f"{mbid}.png"
        if local_png.exists():
            return str(local_png) if local_png.stat().st_size > 0 else None

        url = f"{COVER_ART_BASE}/release/{mbid}/front-250"
        try:
            self._throttle()
            resp = self._http.get(url, follow_redirects=True)
            resp.raise_for_status()

            content_type = resp.headers.get("content-type", "")
            ext = ".png" if "png" in content_type else ".jpg"
            local_file = self.covers_dir / f"{mbid}{ext}"
            local_file.write_bytes(resp.content)
            log.info("Downloaded cover art for %s", mbid)
            return str(local_file)
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            log.debug("Cover art not available for %s: %s", mbid, e)
            local_file.parent.mkdir(parents=True, exist_ok=True)
            local_file.touch()
            return None

    def search_artist(self, name: str) -> dict | None:
        """Search MusicBrainz for an artist by name."""
        query = f'artist:"{name}"'
        cache_key = f"artist-search-{query}"
        cached = self._read_cache("search", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached
        data = self._api_request("/artist", {"query": query, "limit": "5"})
        if data:
            self._write_cache("search", cache_key, data)
        return data

    def get_artist(self, mbid: str, includes: list[str] | None = None) -> dict | None:
        """Lookup an artist by MBID with optional includes (artist-rels, tags, genres)."""
        inc = "+".join(includes) if includes else "artist-rels+tags+genres"
        cache_key = f"artist-{mbid}-{inc}"
        cached = self._read_cache("artist", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached
        data = self._api_request(f"/artist/{mbid}", {"inc": inc})
        if data:
            self._write_cache("artist", cache_key, data)
        return data

    def browse_release_groups(self, artist_mbid: str, limit: int = 25) -> dict | None:
        """Browse release-groups by artist. Returns albums/EPs/singles by this artist."""
        cache_key = f"rg-browse-{artist_mbid}-{limit}"
        cached = self._read_cache("browse", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached
        data = self._api_request("/release-group", {
            "artist": artist_mbid,
            "limit": str(limit),
            "type": "album|ep",
        })
        if data:
            self._write_cache("browse", cache_key, data)
        return data

    def browse_releases_by_label(self, label_mbid: str, limit: int = 25) -> dict | None:
        """Browse releases by label."""
        cache_key = f"release-label-{label_mbid}-{limit}"
        cached = self._read_cache("browse", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached
        data = self._api_request("/release", {
            "label": label_mbid,
            "limit": str(limit),
            "inc": "artist-credits",
        })
        if data:
            self._write_cache("browse", cache_key, data)
        return data

    def get_artist_with_release_rels(self, mbid: str) -> dict | None:
        """Lookup artist with URL and label relationships."""
        inc = "artist-rels+label-rels+url-rels+tags+genres"
        cache_key = f"artist-full-{mbid}"
        cached = self._read_cache("artist", cache_key, ttl=CACHE_TTL_SEARCH)
        if cached is not None:
            return cached
        data = self._api_request(f"/artist/{mbid}", {"inc": inc})
        if data:
            self._write_cache("artist", cache_key, data)
        return data
