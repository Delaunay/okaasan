"""Filesystem cache for raw Garmin API responses.

Every API call is saved to disk before normalization so that:
  1. You can inspect what Garmin actually returned.
  2. You can replay a sync from cached data without hitting the API.

Cache layout::

    private/garminconnect/<endpoint>/<date>.json
"""

from __future__ import annotations

import json
import logging
from datetime import date as date_type
from pathlib import Path
from typing import Any

from ..paths import private_folder

log = logging.getLogger("okaasan.health.garmin_cache")


def _cache_dir(config_dir: Path) -> Path:
    d = private_folder() / "garminconnect"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _path_for(config_dir: Path, endpoint: str, day: date_type) -> Path:
    d = _cache_dir(config_dir) / endpoint
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{day.isoformat()}.json"


def cache_response(config_dir: Path, endpoint: str, day: date_type, data: Any) -> Path:
    """Write a raw API response to the cache and return the file path."""
    p = _path_for(config_dir, endpoint, day)
    try:
        p.write_text(json.dumps(data, default=str, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        log.warning("Failed to cache %s/%s: %s", endpoint, day, exc)
    return p


def load_cached(config_dir: Path, endpoint: str, day: date_type) -> Any | None:
    """Load a previously cached response. Returns None if not found."""
    p = _path_for(config_dir, endpoint, day)
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("Failed to read cache %s: %s", p, exc)
        return None


def fetch_or_cache(
    config_dir: Path,
    endpoint: str,
    day: date_type,
    api_call,
    *,
    replay: bool = False,
) -> Any | None:
    """Fetch from API (and cache) or load from cache if replay=True.

    ``api_call`` is a zero-arg callable that returns the raw API response.
    """
    if replay:
        data = load_cached(config_dir, endpoint, day)
        if data is None:
            log.debug("Cache miss (replay) for %s/%s", endpoint, day)
        return data

    try:
        data = api_call()
    except Exception as exc:
        log.warning("API call failed for %s/%s: %s", endpoint, day, exc)
        return None

    if data is not None:
        cache_response(config_dir, endpoint, day, data)
    return data
