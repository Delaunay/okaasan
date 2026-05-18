"""SQLAlchemy models for the books module."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Text, ForeignKey, Index,
)
from sqlalchemy.orm import relationship

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Book(Base):
    """Canonical record for a book."""

    __tablename__ = "books_media"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    author = Column(String(500), nullable=True)
    isbn = Column(String(20), nullable=True)
    open_library_id = Column(String(50), nullable=True)
    description = Column(Text, nullable=True)
    cover_path = Column(String(500), nullable=True)
    page_count = Column(Integer, nullable=True)
    year = Column(Integer, nullable=True)
    genre = Column(String(200), nullable=True)
    language = Column(String(10), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    progress = relationship("ReadingProgress", back_populates="book", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_books_title", "title"),
        Index("idx_books_author", "author"),
        Index("idx_books_isbn", "isbn"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "isbn": self.isbn,
            "open_library_id": self.open_library_id,
            "description": self.description,
            "cover_path": self.cover_path,
            "page_count": self.page_count,
            "year": self.year,
            "genre": self.genre,
            "language": self.language,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


class ReadingProgress(Base):
    """Reading progress for a book."""

    __tablename__ = "books_progress"

    id = Column(Integer, primary_key=True)
    book_id = Column(Integer, ForeignKey("books_media.id", ondelete="CASCADE"), nullable=False)
    current_page = Column(Integer, nullable=True)
    current_cfi = Column(String(500), nullable=True)
    total_pages = Column(Integer, nullable=True)
    percent = Column(Float, nullable=True)
    last_read_at = Column(DateTime, default=_utcnow)

    book = relationship("Book", back_populates="progress")

    __table_args__ = (
        Index("idx_bp_book_id", "book_id"),
        Index("idx_bp_last_read", "last_read_at"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "book_id": self.book_id,
            "current_page": self.current_page,
            "current_cfi": self.current_cfi,
            "total_pages": self.total_pages,
            "percent": self.percent,
            "last_read_at": self.last_read_at.isoformat() + "Z" if self.last_read_at else None,
        }
