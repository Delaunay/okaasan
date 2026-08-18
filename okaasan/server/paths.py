"""Centralised path helpers for the okaasan server."""
from __future__ import annotations

import os
from pathlib import Path

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

STATIC_FOLDER_DEFAULT = os.path.join(ROOT, 'static')
STATIC_FOLDER = os.path.abspath(
    os.getenv("OKAASAN_DATA") or os.getenv("FLASK_STATIC", STATIC_FOLDER_DEFAULT)
)
ORIGINALS_FOLDER = '/mnt/xshare/projects/recipes/originals'


def private_folder(base: str | Path | None = None) -> Path:
    """Return the private data directory, creating it if needed."""
    root = Path(base) if base else Path(STATIC_FOLDER)
    d = root / "private"
    d.mkdir(parents=True, exist_ok=True)
    return d


def public_folder(base: str | Path | None = None) -> Path:
    """Return the public uploads directory, creating it if needed."""
    root = Path(base) if base else Path(STATIC_FOLDER)
    d = root / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def cache_folder(base: str | Path | None = None) -> Path:
    """Return the ephemeral cache directory, creating it if needed."""
    root = Path(base) if base else Path(STATIC_FOLDER)
    d = root / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d


def thirdparty_folder(base: str | Path | None = None) -> Path:
    """Downloaded images for recipes scraped from external sites (HelloFresh, etc).

    Kept separate from ``uploads/`` since these photos aren't ours. Callers
    should namespace by source, e.g. ``thirdparty_folder() / "hellofresh"``.
    """
    root = Path(base) if base else Path(STATIC_FOLDER)
    d = root / "thirdparty"
    d.mkdir(parents=True, exist_ok=True)
    return d


def logs_folder(base: str | Path | None = None) -> Path:
    """Return the logs directory under private/, creating it if needed."""
    d = private_folder(base) / "logs"
    d.mkdir(parents=True, exist_ok=True)
    return d
