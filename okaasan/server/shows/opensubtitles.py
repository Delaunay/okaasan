"""OpenSubtitles.com REST API v1 client — ad-hoc subtitle search/download."""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger("okaasan.shows.opensubtitles")

API_BASE = "https://api.opensubtitles.com/api/v1"


class OpenSubtitlesClient:
    """Thin client for searching and downloading subtitles.

    Only an API key is required (register a free one at opensubtitles.com).
    Username/password are optional — logging in exchanges them for a JWT
    that raises the daily download quota, but search and low-volume
    downloads work fine on the API key alone.
    """

    def __init__(self, api_key: str | None = None, username: str | None = None, password: str | None = None):
        self.api_key = api_key or os.getenv("OPENSUBTITLES_API_KEY", "")
        self.username = username
        self.password = password
        self._token: str | None = None

        headers = {
            "Accept": "application/json",
            "User-Agent": "okaasan v1.0",
        }
        if self.api_key:
            headers["Api-Key"] = self.api_key
        transport = httpx.HTTPTransport(local_address="0.0.0.0")
        self._http = httpx.Client(base_url=API_BASE, headers=headers, timeout=15.0, transport=transport)

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _login(self) -> None:
        """Exchange username/password for a JWT, if configured. Best-effort —
        search/download still work (at the lower quota) if this fails."""
        if self._token or not (self.username and self.password):
            return
        try:
            resp = self._http.post("/login", json={"username": self.username, "password": self.password})
            resp.raise_for_status()
            token = resp.json().get("token")
            if token:
                self._token = token
                self._http.headers["Authorization"] = f"Bearer {token}"
        except httpx.HTTPError as e:
            log.warning("OpenSubtitles login failed (continuing without JWT): %s", e)

    def search(
        self,
        query: str,
        *,
        season_number: int | None = None,
        episode_number: int | None = None,
        languages: str = "en",
    ) -> list[dict[str, Any]]:
        """Search for subtitles. Returns a simplified list of candidates,
        best matches first (the API already sorts by relevance/downloads)."""
        if not self.available:
            raise RuntimeError("OpenSubtitles is not configured (missing API key)")
        self._login()

        params: dict[str, Any] = {"query": query, "languages": languages}
        if season_number is not None:
            params["season_number"] = season_number
        if episode_number is not None:
            params["episode_number"] = episode_number

        resp = self._http.get("/subtitles", params=params)
        resp.raise_for_status()
        data = resp.json().get("data", [])

        results: list[dict[str, Any]] = []
        for item in data:
            attrs = item.get("attributes", {})
            files = attrs.get("files") or []
            if not files:
                continue
            feature = attrs.get("feature_details") or {}
            results.append({
                "id": item.get("id"),
                "file_id": files[0].get("file_id"),
                "file_name": files[0].get("file_name"),
                "release": attrs.get("release"),
                "language": attrs.get("language"),
                "download_count": attrs.get("download_count", 0),
                "ratings": attrs.get("ratings", 0),
                "hearing_impaired": attrs.get("hearing_impaired", False),
                "ai_translated": attrs.get("ai_translated", False),
                "title": feature.get("title") or feature.get("movie_name"),
            })
        return results

    def download(self, file_id: int) -> tuple[bytes, str]:
        """Download one subtitle file. Returns (content, file_name)."""
        if not self.available:
            raise RuntimeError("OpenSubtitles is not configured (missing API key)")
        self._login()

        resp = self._http.post("/download", json={"file_id": file_id})
        resp.raise_for_status()
        info = resp.json()
        link = info.get("link")
        if not link:
            raise RuntimeError(f"OpenSubtitles download failed: {info.get('message', 'no link returned')}")

        file_name = info.get("file_name") or f"{file_id}.srt"
        content_resp = httpx.get(link, timeout=30.0)
        content_resp.raise_for_status()
        return content_resp.content, file_name
