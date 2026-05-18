"""Unified poster storage — downloads from Trakt or TMDB, saves to a single folder."""
from __future__ import annotations

import logging
from pathlib import Path

import httpx

from ..paths import public_folder

log = logging.getLogger("okaasan.shows.posters")

TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"


class PosterStore:
    """Manages poster files in uploads/data/shows/posters/."""

    def __init__(self, base_dir: Path):
        self.posters_dir = public_folder() / "data" / "shows" / "posters"
        self.posters_dir.mkdir(parents=True, exist_ok=True)
        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        self._http = httpx.Client(
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0"},
            timeout=15.0,
            follow_redirects=True,
            transport=transport,
        )

    def _filename(self, media_type: str, trakt_id: int | None, tmdb_id: int | None) -> str:
        """Deterministic filename for a media item's poster."""
        key = tmdb_id or trakt_id or 0
        return f"{media_type}-{key}.jpg"

    def get_path(self, media_type: str, trakt_id: int | None = None, tmdb_id: int | None = None) -> str | None:
        """Return relative path to poster if it exists on disk, else None."""
        fname = self._filename(media_type, trakt_id, tmdb_id)
        local = self.posters_dir / fname
        if local.exists():
            return f"uploads/data/shows/posters/{fname}"
        return None

    def has_poster(self, media_type: str, trakt_id: int | None = None, tmdb_id: int | None = None) -> bool:
        fname = self._filename(media_type, trakt_id, tmdb_id)
        return (self.posters_dir / fname).exists()

    def save_from_trakt(self, media_type: str, trakt_id: int, poster_url: str, tmdb_id: int | None = None) -> str | None:
        """Download poster from Trakt CDN if file doesn't already exist."""
        fname = self._filename(media_type, trakt_id, tmdb_id)
        local = self.posters_dir / fname
        if local.exists():
            return f"uploads/data/shows/posters/{fname}"

        url = poster_url if poster_url.startswith("http") else f"https://{poster_url}"
        try:
            resp = self._http.get(url)
            resp.raise_for_status()
            local.write_bytes(resp.content)
            log.debug("Saved Trakt poster: %s", fname)
            return f"uploads/data/shows/posters/{fname}"
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            log.debug("Failed to download Trakt poster %s: %s", url, e)
            return None

    def save_from_tmdb(self, media_type: str, tmdb_id: int, tmdb_poster_path: str, trakt_id: int | None = None) -> str | None:
        """Download poster from TMDB CDN if file doesn't already exist."""
        fname = self._filename(media_type, trakt_id, tmdb_id)
        local = self.posters_dir / fname
        if local.exists():
            return f"uploads/data/shows/posters/{fname}"

        url = f"{TMDB_IMAGE_BASE}{tmdb_poster_path}"
        try:
            resp = self._http.get(url)
            resp.raise_for_status()
            local.write_bytes(resp.content)
            log.debug("Saved TMDB poster: %s", fname)
            return f"uploads/data/shows/posters/{fname}"
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            log.debug("Failed to download TMDB poster %s: %s", url, e)
            return None
