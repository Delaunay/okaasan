"""Models for the ROM library (stored in private DB)."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, BigInteger, Boolean, DateTime, Index

from ..models.common import Base


class RomFile(Base):
    """A ROM file on disk, optionally linked to a games_media entry."""

    __tablename__ = "rom_files"

    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, nullable=True)
    file_path = Column(String(2000), nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)
    platform = Column(String(50), nullable=True)
    container = Column(String(20), nullable=True)
    title = Column(String(500), nullable=True)
    last_scanned = Column(DateTime, nullable=True)
    matched = Column(Boolean, default=False)

    __table_args__ = (
        Index("idx_rf_game_id", "game_id"),
        Index("idx_rf_platform", "platform"),
        Index("idx_rf_path", "file_path"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "game_id": self.game_id,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "platform": self.platform,
            "container": self.container,
            "title": self.title,
            "matched": self.matched,
        }
