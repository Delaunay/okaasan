"""Torrent discovery — search via pyackett + DHT crawling."""
from __future__ import annotations

from .routes import create_discover_router

__all__ = ["create_discover_router"]
