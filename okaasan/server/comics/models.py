"""SQLAlchemy models for comics/manga tracking."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text, Index,
    ForeignKey,
)
from sqlalchemy.orm import relationship

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Comic(Base):
    """Canonical record for a comic or manga volume/issue."""

    __tablename__ = "comics_media"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    series = Column(String(500), nullable=True)
    issue_number = Column(Integer, nullable=True)
    volume = Column(Integer, nullable=True)
    author = Column(String(500), nullable=True)
    artist = Column(String(500), nullable=True)
    publisher = Column(String(300), nullable=True)
    year = Column(Integer, nullable=True)
    cover_path = Column(String(500), nullable=True)
    comicvine_id = Column(Integer, nullable=True)
    anilist_id = Column(Integer, nullable=True)
    media_type = Column(String(10), nullable=False, default="comic")  # "comic" or "manga"
    page_count = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    progress = relationship("ComicProgress", back_populates="comic", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_comics_title", "title"),
        Index("idx_comics_series", "series"),
        Index("idx_comics_comicvine", "comicvine_id"),
        Index("idx_comics_anilist", "anilist_id"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "series": self.series,
            "issue_number": self.issue_number,
            "volume": self.volume,
            "author": self.author,
            "artist": self.artist,
            "publisher": self.publisher,
            "year": self.year,
            "cover_path": self.cover_path,
            "comicvine_id": self.comicvine_id,
            "anilist_id": self.anilist_id,
            "media_type": self.media_type,
            "page_count": self.page_count,
            "description": self.description,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


class ComicProgress(Base):
    """Reading progress for a comic."""

    __tablename__ = "comics_progress"

    id = Column(Integer, primary_key=True)
    comic_id = Column(Integer, ForeignKey("comics_media.id", ondelete="CASCADE"), nullable=False)
    current_page = Column(Integer, nullable=False, default=0)
    total_pages = Column(Integer, nullable=False, default=0)
    percent = Column(Float, nullable=False, default=0.0)
    last_read_at = Column(DateTime, default=_utcnow)

    comic = relationship("Comic", back_populates="progress")

    __table_args__ = (
        Index("idx_cprog_comic", "comic_id"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "comic_id": self.comic_id,
            "current_page": self.current_page,
            "total_pages": self.total_pages,
            "percent": self.percent,
            "last_read_at": self.last_read_at.isoformat() + "Z" if self.last_read_at else None,
        }
