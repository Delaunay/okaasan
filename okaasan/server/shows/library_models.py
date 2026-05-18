"""Models for the media library (stored in private DB)."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Index

from ..models.common import Base


class MediaFile(Base):
    """A video file on disk linked to a media entry."""

    __tablename__ = "media_files"

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, nullable=True)
    media_type = Column(String(10), nullable=False)  # show, movie, anime
    tmdb_id = Column(Integer, nullable=True)
    title = Column(String(500), nullable=True)
    season = Column(Integer, nullable=True)
    episode = Column(Integer, nullable=True)
    file_path = Column(String(2000), nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)
    container = Column(String(10), nullable=True)  # mkv, mp4, avi, etc.
    last_scanned = Column(DateTime, nullable=True)
    matched = Column(Boolean, default=False)

    __table_args__ = (
        Index("idx_mf_media_id", "media_id"),
        Index("idx_mf_tmdb_id", "tmdb_id"),
        Index("idx_mf_path", "file_path"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "media_id": self.media_id,
            "media_type": self.media_type,
            "tmdb_id": self.tmdb_id,
            "title": self.title,
            "season": self.season,
            "episode": self.episode,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "container": self.container,
            "matched": self.matched,
        }
