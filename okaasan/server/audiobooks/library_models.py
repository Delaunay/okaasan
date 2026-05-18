"""Models for the audiobook library (stored in private DB)."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Index

from ..models.common import Base


class AudiobookFile(Base):
    """An audio file on disk linked to an audiobook entry."""

    __tablename__ = "audiobook_files"

    id = Column(Integer, primary_key=True)
    audiobook_id = Column(Integer, nullable=True)
    file_path = Column(String(2000), nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)
    container = Column(String(10), nullable=True)  # m4b, mp3, m4a, ogg, flac
    chapter_number = Column(Integer, nullable=True)
    title = Column(String(500), nullable=True)
    author = Column(String(500), nullable=True)
    last_scanned = Column(DateTime, nullable=True)
    matched = Column(Boolean, default=False)

    __table_args__ = (
        Index("idx_abf_audiobook_id", "audiobook_id"),
        Index("idx_abf_path", "file_path"),
        Index("idx_abf_matched", "matched"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "audiobook_id": self.audiobook_id,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "container": self.container,
            "chapter_number": self.chapter_number,
            "title": self.title,
            "author": self.author,
            "matched": self.matched,
        }
