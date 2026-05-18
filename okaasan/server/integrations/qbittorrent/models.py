"""Models for qBittorrent integration (stored in private DB)."""
from __future__ import annotations

from sqlalchemy import Column, Integer, String, BigInteger, DateTime, Index

from ...models.common import Base


class CompletedDownload(Base):
    """Record of a torrent whose download finished and was cataloged."""

    __tablename__ = "qbt_completed_downloads"

    id = Column(Integer, primary_key=True)
    torrent_hash = Column(String(64), nullable=False, unique=True)
    name = Column(String(1000), nullable=False)
    category = Column(String(100), nullable=True)
    save_path = Column(String(2000), nullable=True)
    content_path = Column(String(2000), nullable=True)
    size = Column(BigInteger, nullable=True)
    media_type = Column(String(50), nullable=True)
    completed_at = Column(DateTime, nullable=True)
    catalog_id = Column(Integer, nullable=True)

    __table_args__ = (
        Index("idx_qbt_hash", "torrent_hash"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "torrent_hash": self.torrent_hash,
            "name": self.name,
            "category": self.category,
            "save_path": self.save_path,
            "content_path": self.content_path,
            "size": self.size,
            "media_type": self.media_type,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "catalog_id": self.catalog_id,
        }
