"""Models for the music library (stored in private DB)."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Index

from ..models.common import Base


class MusicFile(Base):
    """An audio file on disk linked to a music track entry."""

    __tablename__ = "music_files"

    id = Column(Integer, primary_key=True)
    track_id = Column(Integer, nullable=True)
    file_path = Column(String(2000), nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)
    container = Column(String(10), nullable=True)  # mp3, flac, ogg, etc.
    bitrate = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    title = Column(String(500), nullable=True)
    artist = Column(String(500), nullable=True)
    album = Column(String(500), nullable=True)
    last_scanned = Column(DateTime, nullable=True)
    matched = Column(Boolean, default=False)

    __table_args__ = (
        Index("idx_muf_track_id", "track_id"),
        Index("idx_muf_path", "file_path"),
        Index("idx_muf_artist", "artist"),
        Index("idx_muf_album", "album"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "track_id": self.track_id,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "container": self.container,
            "bitrate": self.bitrate,
            "duration_ms": self.duration_ms,
            "title": self.title,
            "artist": self.artist,
            "album": self.album,
            "matched": self.matched,
        }
