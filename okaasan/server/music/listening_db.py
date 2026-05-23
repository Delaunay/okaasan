"""Per-year SQLite databases for streaming listening history.

Each calendar year gets its own ``listening_history/{year}.db`` file under
the data root (``OKAASAN_DATA``).  The tables use a *separate* declarative
base so they are never created inside the main ``database.db``.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterator

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Index, UniqueConstraint,
    create_engine, event,
)
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from ..paths import STATIC_FOLDER

log = logging.getLogger("okaasan.music.listening_db")

ListeningBase = declarative_base()

# ── Models (mirror the old main-DB models, minus FK / relationship) ──


class MusicListeningHistory(ListeningBase):
    """A single music play event from streaming history."""

    __tablename__ = "music_listening_history"

    id = Column(Integer, primary_key=True)
    track_id = Column(Integer, nullable=True)
    played_at = Column(DateTime, nullable=False)
    ms_played = Column(Integer, nullable=True)
    spotify_track_uri = Column(String(200), nullable=True)
    track_name = Column(String(500), nullable=True)
    artist_name = Column(String(500), nullable=True)
    album_name = Column(String(500), nullable=True)
    platform = Column(String(200), nullable=True)
    skipped = Column(Boolean, nullable=True)
    shuffle = Column(Boolean, nullable=True)
    offline = Column(Boolean, nullable=True)
    reason_start = Column(String(50), nullable=True)
    reason_end = Column(String(50), nullable=True)
    source = Column(String(50), nullable=False, default="spotify_import")

    __table_args__ = (
        UniqueConstraint("spotify_track_uri", "played_at", "source", name="uq_music_listen_dedup"),
        Index("idx_mlh_track", "track_id"),
        Index("idx_mlh_played", "played_at"),
        Index("idx_mlh_artist", "artist_name"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "track_id": self.track_id,
            "played_at": self.played_at.isoformat() + "Z" if self.played_at else None,
            "ms_played": self.ms_played,
            "spotify_track_uri": self.spotify_track_uri,
            "track_name": self.track_name,
            "artist_name": self.artist_name,
            "album_name": self.album_name,
            "platform": self.platform,
            "skipped": self.skipped,
            "shuffle": self.shuffle,
            "offline": self.offline,
            "reason_start": self.reason_start,
            "reason_end": self.reason_end,
            "source": self.source,
        }


class PodcastListeningHistory(ListeningBase):
    """A single podcast play event from streaming history."""

    __tablename__ = "podcast_listening_history"

    id = Column(Integer, primary_key=True)
    podcast_id = Column(Integer, nullable=True)
    episode_id = Column(Integer, nullable=True)
    played_at = Column(DateTime, nullable=False)
    ms_played = Column(Integer, nullable=True)
    spotify_episode_uri = Column(String(200), nullable=True)
    episode_name = Column(String(500), nullable=True)
    show_name = Column(String(500), nullable=True)
    platform = Column(String(200), nullable=True)
    skipped = Column(Boolean, nullable=True)
    source = Column(String(50), nullable=False, default="spotify_import")

    __table_args__ = (
        UniqueConstraint("spotify_episode_uri", "played_at", "source", name="uq_podcast_listen_dedup"),
        Index("idx_plh_played", "played_at"),
        Index("idx_plh_show", "show_name"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "podcast_id": self.podcast_id,
            "episode_id": self.episode_id,
            "played_at": self.played_at.isoformat() + "Z" if self.played_at else None,
            "ms_played": self.ms_played,
            "spotify_episode_uri": self.spotify_episode_uri,
            "episode_name": self.episode_name,
            "show_name": self.show_name,
            "platform": self.platform,
            "skipped": self.skipped,
            "source": self.source,
        }


# ── Per-year engine management ───────────────────────────────────────

_engines: dict[int, object] = {}
_session_factories: dict[int, sessionmaker] = {}


def _listening_dir(base: str | Path | None = None) -> Path:
    root = Path(base) if base else Path(STATIC_FOLDER)
    d = root / "listening_history"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


def get_year_engine(year: int, base: str | Path | None = None):
    """Return (and cache) the SQLAlchemy engine for *year*.db."""
    if year in _engines:
        return _engines[year]

    db_path = _listening_dir(base) / f"{year}.db"
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_pre_ping=True,
    )
    event.listen(engine, "connect", _set_sqlite_pragmas)
    ListeningBase.metadata.create_all(bind=engine)
    _engines[year] = engine
    return engine


def get_year_session(year: int, base: str | Path | None = None) -> sessionmaker:
    """Return a sessionmaker bound to the *year* database."""
    if year not in _session_factories:
        engine = get_year_engine(year, base)
        _session_factories[year] = sessionmaker(bind=engine)
    return _session_factories[year]


def iter_year_dbs(base: str | Path | None = None) -> Iterator[tuple[int, Path]]:
    """Yield ``(year, path)`` for every existing year database."""
    d = _listening_dir(base)
    for p in sorted(d.glob("*.db")):
        try:
            year = int(p.stem)
        except ValueError:
            continue
        yield year, p


def iter_all_year_sessions(base: str | Path | None = None) -> Iterator[tuple[int, Session]]:
    """Yield ``(year, session)`` for every existing year database."""
    for year, _ in iter_year_dbs(base):
        SL = get_year_session(year, base)
        db = SL()
        try:
            yield year, db
        finally:
            db.close()


def get_history_stats(base: str | Path | None = None) -> list[dict]:
    """Return per-year stats: row counts, file sizes."""
    results = []
    for year, path in iter_year_dbs(base):
        SL = get_year_session(year, base)
        db = SL()
        try:
            music_count = db.query(MusicListeningHistory).count()
            podcast_count = db.query(PodcastListeningHistory).count()
        finally:
            db.close()
        results.append({
            "year": year,
            "music_plays": music_count,
            "podcast_plays": podcast_count,
            "size_mb": round(os.path.getsize(path) / 1024 / 1024, 2),
        })
    return results
