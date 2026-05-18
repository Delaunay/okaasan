"""SQLAlchemy models for audiobook tracking."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, BigInteger, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import relationship

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Audiobook(Base):
    """Canonical record for an audiobook."""

    __tablename__ = "audiobooks_media"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    author = Column(String(500), nullable=True)
    narrator = Column(String(500), nullable=True)
    duration_ms = Column(BigInteger, nullable=True)
    asin = Column(String(50), nullable=True, unique=True)
    audnexus_id = Column(String(100), nullable=True)
    cover_path = Column(String(500), nullable=True)
    year = Column(Integer, nullable=True)
    description = Column(Text, nullable=True)
    chapter_count = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    chapters = relationship("AudiobookChapter", back_populates="audiobook", cascade="all, delete-orphan")
    progress = relationship("ListeningProgress", back_populates="audiobook", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_audiobook_title", "title"),
        Index("idx_audiobook_author", "author"),
        Index("idx_audiobook_asin", "asin"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "narrator": self.narrator,
            "duration_ms": self.duration_ms,
            "asin": self.asin,
            "audnexus_id": self.audnexus_id,
            "cover_path": self.cover_path,
            "year": self.year,
            "description": self.description,
            "chapter_count": self.chapter_count,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


class AudiobookChapter(Base):
    """Chapter within an audiobook."""

    __tablename__ = "audiobooks_chapters"

    id = Column(Integer, primary_key=True)
    audiobook_id = Column(Integer, ForeignKey("audiobooks_media.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=True)
    start_ms = Column(BigInteger, nullable=False, default=0)
    end_ms = Column(BigInteger, nullable=True)
    chapter_number = Column(Integer, nullable=False)

    audiobook = relationship("Audiobook", back_populates="chapters")

    __table_args__ = (
        Index("idx_chapter_audiobook", "audiobook_id"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "audiobook_id": self.audiobook_id,
            "title": self.title,
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "chapter_number": self.chapter_number,
        }


class ListeningProgress(Base):
    """Tracks user's listening position within an audiobook."""

    __tablename__ = "audiobooks_progress"

    id = Column(Integer, primary_key=True)
    audiobook_id = Column(Integer, ForeignKey("audiobooks_media.id", ondelete="CASCADE"), nullable=False, unique=True)
    position_ms = Column(BigInteger, nullable=False, default=0)
    chapter_number = Column(Integer, nullable=True)
    last_listened_at = Column(DateTime, default=_utcnow)

    audiobook = relationship("Audiobook", back_populates="progress")

    __table_args__ = (
        Index("idx_progress_audiobook", "audiobook_id"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "audiobook_id": self.audiobook_id,
            "position_ms": self.position_ms,
            "chapter_number": self.chapter_number,
            "last_listened_at": self.last_listened_at.isoformat() + "Z" if self.last_listened_at else None,
        }
