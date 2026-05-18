"""IGDB API integration via Twitch OAuth with disk caching."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any

import httpx

log = logging.getLogger("okaasan.games.metadata")

IGDB_API_BASE = "https://api.igdb.com/v4"
TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
IGDB_IMAGE_BASE = "https://images.igdb.com/igdb/image/upload"
MAX_REQUESTS_PER_SECOND = 4

PLATFORM_TO_IGDB: dict[str, int] = {
    "nes": 18,
    "snes": 19,
    "n64": 4,
    "gb": 33,
    "gbc": 22,
    "gba": 24,
    "nds": 20,
    "genesis": 29,
    "sms": 64,
    "psx": 7,
    "psp": 38,
    "arcade": 52,
}


class IGDBClient:
    """IGDB API client with Twitch OAuth and local disk caching."""

    def __init__(self, cache_dir: Path, client_id: str | None = None, client_secret: str | None = None):
        self.client_id = client_id or ""
        self.client_secret = client_secret or ""
        self.cache_dir = cache_dir
        self.meta_cache_dir = cache_dir / "metadata"
        self.cover_dir = cache_dir.parent / "covers"
        self.meta_cache_dir.mkdir(parents=True, exist_ok=True)
        self.cover_dir.mkdir(parents=True, exist_ok=True)

        self._access_token: str | None = None
        self._token_expires_at: float = 0
        self._token_lock = threading.Lock()
        self._rate_lock = threading.Lock()
        self._request_timestamps: deque[float] = deque()

        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        self._http = httpx.Client(timeout=15.0, transport=transport)

    @property
    def available(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def _ensure_token(self) -> str | None:
        """Get a valid access token, refreshing via Twitch OAuth if expired."""
        with self._token_lock:
            if self._access_token and time.time() < self._token_expires_at:
                return self._access_token

            if not self.available:
                return None

            try:
                resp = self._http.post(TWITCH_TOKEN_URL, params={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials",
                })
                resp.raise_for_status()
                data = resp.json()
                self._access_token = data["access_token"]
                self._token_expires_at = time.time() + data.get("expires_in", 3600) - 60
                log.info("Obtained IGDB access token (expires in %ds)", data.get("expires_in", 0))
                return self._access_token
            except (httpx.HTTPStatusError, httpx.RequestError, KeyError, ValueError) as e:
                log.warning("Failed to obtain Twitch OAuth token: %s", e)
                return None

    def _cache_path(self, category: str, key: str) -> Path:
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return self.meta_cache_dir / category / f"{safe_key}.json"

    def _read_cache(self, category: str, key: str) -> dict | list | None:
        path = self._cache_path(category, key)
        if not path.exists():
            return None
        try:
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
        with self._rate_lock:
            now = time.monotonic()
            while self._request_timestamps and now - self._request_timestamps[0] > 1.0:
                self._request_timestamps.popleft()

            if len(self._request_timestamps) >= MAX_REQUESTS_PER_SECOND:
                sleep_for = 1.0 - (now - self._request_timestamps[0])
                if sleep_for > 0:
                    time.sleep(sleep_for)
                now = time.monotonic()
                while self._request_timestamps and now - self._request_timestamps[0] > 1.0:
                    self._request_timestamps.popleft()

            self._request_timestamps.append(time.monotonic())

    def _api_request(self, endpoint: str, body: str) -> list[dict] | None:
        """POST to IGDB API with Apicalypse body syntax."""
        token = self._ensure_token()
        if not token:
            return None

        self._throttle()

        url = f"{IGDB_API_BASE}{endpoint}"
        headers = {
            "Client-ID": self.client_id,
            "Authorization": f"Bearer {token}",
        }

        try:
            t0 = time.monotonic()
            resp = self._http.post(url, content=body, headers=headers)
            elapsed = (time.monotonic() - t0) * 1000
            resp.raise_for_status()
            log.info("IGDB %s completed in %.0fms (status %d)", endpoint, elapsed, resp.status_code)
            return resp.json()
        except (httpx.HTTPStatusError, httpx.RequestError, ValueError) as e:
            log.warning("IGDB %s failed: %s", endpoint, e)
            return None

    def search_game(self, title: str, platform: str | None = None) -> list[dict]:
        """Search IGDB for games matching title (and optionally platform)."""
        cache_key = f"search-{title}-{platform or 'any'}"
        cached = self._read_cache("search", cache_key)
        if cached is not None:
            return cached

        fields = (
            "fields name,cover,genres.name,platforms.name,"
            "first_release_date,summary,"
            "involved_companies.company.name;"
        )
        body = f'search "{title}"; {fields} limit 10;'

        if platform and platform in PLATFORM_TO_IGDB:
            igdb_plat = PLATFORM_TO_IGDB[platform]
            body = f'search "{title}"; {fields} where platforms = ({igdb_plat}); limit 10;'

        results = self._api_request("/games", body)
        if results is None:
            return []

        self._write_cache("search", cache_key, results)
        return results

    def get_game(self, igdb_id: int) -> dict | None:
        """Get full game detail by IGDB ID."""
        cache_key = f"game-{igdb_id}"
        cached = self._read_cache("games", cache_key)
        if cached is not None:
            return cached

        body = (
            f"fields name,cover.image_id,genres.name,platforms.name,"
            f"first_release_date,summary,storyline,"
            f"involved_companies.company.name,involved_companies.developer,"
            f"involved_companies.publisher,"
            f"player_perspectives.name,game_modes.name,"
            f"total_rating,total_rating_count,"
            f"screenshots.image_id;"
            f" where id = {igdb_id}; limit 1;"
        )

        results = self._api_request("/games", body)
        if not results:
            return None

        data = results[0]
        self._write_cache("games", cache_key, data)
        return data

    def get_cover(self, cover_id: int) -> str | None:
        """Fetch cover image_id from IGDB, download image, return local path."""
        cache_key = f"cover-{cover_id}"
        cached = self._read_cache("covers", cache_key)
        if cached and cached.get("local_path"):
            local = Path(cached["local_path"])
            if local.exists():
                return cached["local_path"]

        body = f"fields image_id; where id = {cover_id}; limit 1;"
        results = self._api_request("/covers", body)
        if not results or not results[0].get("image_id"):
            return None

        image_id = results[0]["image_id"]
        return self._download_cover(image_id, cover_id)

    def _download_cover(self, image_id: str, cover_id: int) -> str | None:
        """Download a cover image and save locally."""
        url = f"{IGDB_IMAGE_BASE}/t_cover_big/{image_id}.jpg"
        local_file = self.cover_dir / f"{image_id}.jpg"

        if local_file.exists():
            rel = str(local_file.relative_to(self.cover_dir.parent.parent))
            self._write_cache("covers", f"cover-{cover_id}", {"local_path": str(local_file), "relative": rel})
            return rel

        try:
            resp = self._http.get(url)
            resp.raise_for_status()
            local_file.write_bytes(resp.content)
            rel = str(local_file.relative_to(self.cover_dir.parent.parent))
            self._write_cache("covers", f"cover-{cover_id}", {"local_path": str(local_file), "relative": rel})
            log.info("Downloaded cover %s -> %s", image_id, local_file)
            return rel
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            log.warning("Failed to download cover %s: %s", url, e)
            return None

    def get_cover_for_game(self, igdb_id: int) -> str | None:
        """Convenience: get cover for a game by its IGDB ID."""
        game = self.get_game(igdb_id)
        if not game:
            return None
        cover = game.get("cover")
        if isinstance(cover, dict):
            image_id = cover.get("image_id")
            if image_id:
                return self._download_cover(image_id, cover.get("id", 0))
        elif isinstance(cover, int):
            return self.get_cover(cover)
        return None
