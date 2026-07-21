"""TMDB API integration with aggressive disk caching."""
from __future__ import annotations

import json
import hashlib
import logging
import os
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("okaasan.shows.tmdb")

TMDB_API_BASE = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"
CACHE_TTL_MOVIE = 0           # movies never expire
CACHE_TTL_TV = 30 * 24 * 60 * 60  # 30 days for TV shows (new seasons/episodes)
CACHE_TTL_DISCOVER = 24 * 60 * 60  # 24 hours for discover/search results
MAX_REQUESTS_PER_SECOND = 40


class TMDBClient:
    """TMDB API client with local disk caching for metadata and images."""

    def __init__(self, cache_dir: Path, api_key: str | None = None, bearer_token: str | None = None, image_dir: Path | None = None):
        self.api_key = api_key or os.getenv("TMDB_API_KEY", "")
        self.bearer_token = bearer_token or os.getenv("TMDB_BEARER_TOKEN", "")
        self.cache_dir = cache_dir
        self.meta_cache_dir = cache_dir / "metadata"
        self.image_cache_dir = image_dir if image_dir else cache_dir / "images"
        self.meta_cache_dir.mkdir(parents=True, exist_ok=True)
        self.image_cache_dir.mkdir(parents=True, exist_ok=True)
        self._rate_lock = threading.Lock()
        self._request_timestamps: deque[float] = deque()
        self._refresh_lock = threading.Lock()
        self._refreshing: set[str] = set()

        headers = {
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        }
        if self.bearer_token:
            headers["Authorization"] = f"Bearer {self.bearer_token}"
        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        self._http = httpx.Client(headers=headers, timeout=15.0, transport=transport)

    @property
    def available(self) -> bool:
        return bool(self.bearer_token or self.api_key)

    def _cache_path(self, category: str, key: str) -> Path:
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return self.meta_cache_dir / category / f"{safe_key}.json"

    def _read_cache(self, category: str, key: str, ttl: int | None = None) -> dict | None:
        path = self._cache_path(category, key)
        if not path.exists():
            return None
        if ttl is None:
            if category == "movie":
                ttl = CACHE_TTL_MOVIE
            elif category == "discover":
                ttl = CACHE_TTL_DISCOVER
            else:
                ttl = CACHE_TTL_TV
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
        """Block until we're under MAX_REQUESTS_PER_SECOND."""
        with self._rate_lock:
            now = time.monotonic()
            # Discard timestamps older than 1 second
            while self._request_timestamps and now - self._request_timestamps[0] > 1.0:
                self._request_timestamps.popleft()

            if len(self._request_timestamps) >= MAX_REQUESTS_PER_SECOND:
                sleep_for = 1.0 - (now - self._request_timestamps[0])
                if sleep_for > 0:
                    time.sleep(sleep_for)
                # Clean again after sleep
                now = time.monotonic()
                while self._request_timestamps and now - self._request_timestamps[0] > 1.0:
                    self._request_timestamps.popleft()

            self._request_timestamps.append(time.monotonic())

    def _api_request(self, endpoint: str, params: dict | None = None) -> dict | None:
        if not self.available:
            return None

        self._throttle()

        url = f"{TMDB_API_BASE}{endpoint}"
        query = params.copy() if params else {}
        if not self.bearer_token:
            query["api_key"] = self.api_key

        try:
            t0 = time.monotonic()
            resp = self._http.get(url, params=query)
            elapsed = (time.monotonic() - t0) * 1000
            resp.raise_for_status()
            log.info("TMDB %s completed in %.0fms (status %d)", endpoint, elapsed, resp.status_code)
            return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            elapsed = (time.monotonic() - t0) * 1000
            log.warning("TMDB %s failed after %.0fms: %s", endpoint, elapsed, e)
            return None

    def _fetch_and_cache_show(self, tmdb_id: int) -> dict | None:
        """Fetch TV show details from TMDB and write to disk cache."""
        cache_key = f"tv-{tmdb_id}"
        data = self._api_request(f"/tv/{tmdb_id}", params={"append_to_response": "external_ids"})
        if data:
            ext = data.pop("external_ids", None)
            if ext and ext.get("imdb_id"):
                data["imdb_id"] = ext["imdb_id"]
            self._write_cache("tv", cache_key, data)
        return data

    def _schedule_show_refresh(self, tmdb_id: int) -> None:
        """Refresh a show in a background thread (deduped per tmdb_id)."""
        cache_key = f"tv-{tmdb_id}"
        with self._refresh_lock:
            if cache_key in self._refreshing:
                return
            self._refreshing.add(cache_key)

        def _worker():
            try:
                log.info("Background refresh for TV %s", tmdb_id)
                self._fetch_and_cache_show(tmdb_id)
            except Exception as exc:
                log.warning("Background refresh for TV %s failed: %s", tmdb_id, exc)
            finally:
                with self._refresh_lock:
                    self._refreshing.discard(cache_key)

        threading.Thread(target=_worker, name=f"tmdb-refresh-{tmdb_id}", daemon=True).start()

    def get_show(self, tmdb_id: int, max_age: int | None = None, *, allow_stale: bool = False) -> dict | None:
        """Get TV show details, using cache first.

        max_age overrides default TTL (seconds).
        When allow_stale=True and the cache is older than max_age, return the
        stale entry immediately and refresh TMDB data in a background thread.
        """
        cache_key = f"tv-{tmdb_id}"
        cached = self._read_cache("tv", cache_key, ttl=max_age)
        if cached is not None:
            return cached

        if allow_stale:
            # ttl=0 means never expire — read whatever is on disk
            stale = self._read_cache("tv", cache_key, ttl=0)
            if stale is not None:
                self._schedule_show_refresh(tmdb_id)
                return stale

        return self._fetch_and_cache_show(tmdb_id)

    def get_movie(self, tmdb_id: int) -> dict | None:
        """Get movie details, using cache first."""
        cache_key = f"movie-{tmdb_id}"
        cached = self._read_cache("movie", cache_key)
        if cached is not None:
            return cached

        data = self._api_request(f"/movie/{tmdb_id}")
        if data:
            self._write_cache("movie", cache_key, data)
        return data

    def get_season(self, tmdb_id: int, season_number: int) -> dict | None:
        """Get TV show season details (episodes list), using cache first."""
        cache_key = f"tv-{tmdb_id}-season-{season_number}"
        cached = self._read_cache("tv", cache_key)
        if cached is not None:
            return cached

        data = self._api_request(f"/tv/{tmdb_id}/season/{season_number}")
        if data:
            self._write_cache("tv", cache_key, data)
        return data

    def get_poster_path(self, tmdb_id: int, media_type: str = "tv") -> str | None:
        """Get the poster image local path (downloads and caches if needed)."""
        if media_type == "tv":
            info = self.get_show(tmdb_id)
        else:
            info = self.get_movie(tmdb_id)

        if not info or not info.get("poster_path"):
            return None

        poster_remote = info["poster_path"]
        return self._cache_image(poster_remote, f"{media_type}-{tmdb_id}-poster")

    def get_backdrop_path(self, tmdb_id: int, media_type: str = "tv") -> str | None:
        """Get the backdrop image local path."""
        if media_type == "tv":
            info = self.get_show(tmdb_id)
        else:
            info = self.get_movie(tmdb_id)

        if not info or not info.get("backdrop_path"):
            return None

        backdrop_remote = info["backdrop_path"]
        return self._cache_image(backdrop_remote, f"{media_type}-{tmdb_id}-backdrop")

    def _cache_image(self, remote_path: str, local_name: str) -> str | None:
        """Download and cache an image from TMDB."""
        ext = Path(remote_path).suffix or ".jpg"
        local_file = self.image_cache_dir / f"{local_name}{ext}"

        if local_file.exists():
            return str(local_file.relative_to(self.cache_dir.parent.parent))

        if not self.available:
            return None

        url = f"{TMDB_IMAGE_BASE}/w500{remote_path}"
        try:
            resp = self._http.get(url)
            resp.raise_for_status()
            local_file.write_bytes(resp.content)
            return str(local_file.relative_to(self.cache_dir.parent.parent))
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            log.warning("Failed to download TMDB image %s: %s", url, e)
            return None

    def enrich_item(self, item: dict, media_type: str) -> dict:
        """Add TMDB metadata to a Trakt item. Returns enriched copy."""
        if media_type == "show":
            source = item.get("show", {})
        elif media_type == "movie":
            source = item.get("movie", {})
        else:
            return item

        tmdb_id = source.get("ids", {}).get("tmdb")
        if not tmdb_id:
            return item

        tmdb_type = "tv" if media_type == "show" else "movie"
        tmdb_data = self.get_show(tmdb_id) if media_type == "show" else self.get_movie(tmdb_id)

        if not tmdb_data:
            return item

        enriched = dict(item)
        enriched["tmdb"] = {
            "poster_path": tmdb_data.get("poster_path"),
            "backdrop_path": tmdb_data.get("backdrop_path"),
            "overview": tmdb_data.get("overview"),
            "vote_average": tmdb_data.get("vote_average"),
            "genres": [g["name"] for g in tmdb_data.get("genres", [])],
            "status": tmdb_data.get("status"),
            "tagline": tmdb_data.get("tagline"),
        }

        poster_local = self.get_poster_path(tmdb_id, tmdb_type)
        if poster_local:
            enriched["tmdb"]["poster_local"] = poster_local

        return enriched

    def get_cached_metadata(self, tmdb_id: int, media_type: str) -> dict | None:
        """Get cached TMDB metadata without making API calls (for static mode)."""
        tmdb_type = "tv" if media_type == "show" else "movie"
        cache_key = f"{tmdb_type}-{tmdb_id}"
        return self._read_cache(tmdb_type, cache_key)

    def get_all_cached(self) -> dict[str, list[dict]]:
        """Return all cached metadata for static export."""
        result: dict[str, list[dict]] = {"tv": [], "movie": []}
        for category in ("tv", "movie"):
            cat_dir = self.meta_cache_dir / category
            if not cat_dir.exists():
                continue
            for f in cat_dir.glob("*.json"):
                try:
                    with open(f) as fh:
                        data = json.load(fh)
                        data["_cache_file"] = f.stem
                        result[category].append(data)
                except (json.JSONDecodeError, OSError):
                    continue
        return result
