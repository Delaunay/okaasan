"""Models for the comic library (stored in private DB)."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Index

from ..models.common import Base


class ComicFile(Base):
    """A comic file on disk linked to a comic entry."""

    __tablename__ = "comic_files"

    id = Column(Integer, primary_key=True)
    comic_id = Column(Integer, nullable=True)
    file_path = Column(String(2000), nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)
    format = Column(String(10), nullable=True)  # cbz, cbr, pdf, epub
    title = Column(String(500), nullable=True)
    series = Column(String(500), nullable=True)
    issue_number = Column(Integer, nullable=True)
    last_scanned = Column(DateTime, nullable=True)
    matched = Column(Boolean, default=False)

    __table_args__ = (
        Index("idx_cf_comic_id", "comic_id"),
        Index("idx_cf_path", "file_path"),
        Index("idx_cf_series", "series"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "comic_id": self.comic_id,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "format": self.format,
            "title": self.title,
            "series": self.series,
            "issue_number": self.issue_number,
            "matched": self.matched,
        }
