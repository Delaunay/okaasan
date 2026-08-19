"""qBittorrent integration — torrent management + automatic library cataloging."""
from __future__ import annotations

from .routes import create_router


def create_qbittorrent_router(private_engine, video_engine, audio_engine):
    return create_router(private_engine, video_engine, audio_engine)
