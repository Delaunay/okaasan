"""Models for the book library (stored in private DB)."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Index

from ..models.common import Base


class BookFile(Base):
    """A book file on disk, optionally linked to a books_media entry."""

    __tablename__ = "book_files"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, nullable=True)
    file_path = Column(String(2000), nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)
    format = Column(String(10), nullable=True)  # epub, pdf, mobi, azw3, fb2
    title = Column(String(500), nullable=True)
    author = Column(String(500), nullable=True)
    last_scanned = Column(DateTime, nullable=True)
    matched = Column(Boolean, default=False)

    __table_args__ = (
        Index("idx_bf_book_id", "book_id"),
        Index("idx_bf_path", "file_path"),
        Index("idx_bf_title", "title"),
        Index("idx_bf_matched", "matched"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "book_id": self.book_id,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "format": self.format,
            "title": self.title,
            "author": self.author,
            "last_scanned": self.last_scanned.isoformat() + "Z" if self.last_scanned else None,
            "matched": self.matched,
        }
