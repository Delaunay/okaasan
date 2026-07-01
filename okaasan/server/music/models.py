"""SQLAlchemy models for music tracking."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, Integer, String, DateTime, ForeignKey, Index,
)
from sqlalchemy.orm import relationship

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class MusicTrack(Base):
    """Canonical record for a music track."""

    __tablename__ = "music_tracks"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    artist = Column(String(500), nullable=True)
    album = Column(String(500), nullable=True)
    album_artist = Column(String(500), nullable=True)
    track_number = Column(Integer, nullable=True)
    disc_number = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    genre = Column(String(200), nullable=True)
    year = Column(Integer, nullable=True)
    musicbrainz_id = Column(String(36), nullable=True)
    spotify_id = Column(String(100), nullable=True)
    cover_path = Column(String(500), nullable=True)
    play_count = Column(Integer, default=0, nullable=False, server_default="0")
    last_played_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_mt_artist", "artist"),
        Index("idx_mt_album", "album"),
        Index("idx_mt_title", "title"),
        Index("idx_mt_mbid", "musicbrainz_id"),
        Index("idx_mt_spotify", "spotify_id"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "album_artist": self.album_artist,
            "track_number": self.track_number,
            "disc_number": self.disc_number,
            "duration_ms": self.duration_ms,
            "genre": self.genre,
            "year": self.year,
            "musicbrainz_id": self.musicbrainz_id,
            "spotify_id": self.spotify_id,
            "cover_path": self.cover_path,
            "play_count": self.play_count or 0,
            "last_played_at": self.last_played_at.isoformat() + "Z" if self.last_played_at else None,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


class MusicPlaylist(Base):
    """A named playlist of tracks."""

    __tablename__ = "music_playlists"

    id = Column(Integer, primary_key=True)
    name = Column(String(500), nullable=False)
    is_public = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime, default=_utcnow)

    items = relationship(
        "MusicPlaylistItem",
        back_populates="playlist",
        cascade="all, delete-orphan",
        order_by="MusicPlaylistItem.position",
    )

    def to_json(self, include_items: bool = False) -> dict:
        result = {
            "id": self.id,
            "name": self.name,
            "is_public": self.is_public,
            "item_count": len(self.items) if self.items else 0,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }
        if include_items:
            result["items"] = [i.to_json() for i in self.items]
        return result


class MusicPlaylistItem(Base):
    """An item within a music playlist."""

    __tablename__ = "music_playlist_items"

    id = Column(Integer, primary_key=True)
    playlist_id = Column(Integer, ForeignKey("music_playlists.id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("music_tracks.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False, default=0)

    playlist = relationship("MusicPlaylist", back_populates="items")
    track = relationship("MusicTrack")

    __table_args__ = (
        Index("idx_mpi_playlist", "playlist_id"),
        Index("idx_mpi_track", "track_id"),
    )

    def to_json(self) -> dict:
        result = {
            "id": self.id,
            "playlist_id": self.playlist_id,
            "track_id": self.track_id,
            "position": self.position,
        }
        if self.track:
            result["track"] = self.track.to_json()
        return result


class MusicEvent(Base):
    """An upcoming concert, album release, or other music event."""

    __tablename__ = "music_events"

    id = Column(Integer, primary_key=True)
    event_type = Column(String(20), nullable=False)  # concert, release, tour
    title = Column(String(500), nullable=False)
    artist = Column(String(500), nullable=True)
    venue = Column(String(500), nullable=True)
    city = Column(String(200), nullable=True)
    date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=True)
    url = Column(String(1000), nullable=True)
    notes = Column(String(2000), nullable=True)
    cover_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_me_date", "date"),
        Index("idx_me_artist", "artist"),
        Index("idx_me_type", "event_type"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "event_type": self.event_type,
            "title": self.title,
            "artist": self.artist,
            "venue": self.venue,
            "city": self.city,
            "date": self.date.isoformat() + "Z" if self.date else None,
            "end_date": self.end_date.isoformat() + "Z" if self.end_date else None,
            "url": self.url,
            "notes": self.notes,
            "cover_path": self.cover_path,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


