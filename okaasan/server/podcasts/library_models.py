"""Models for podcast downloads (stored in private DB)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, BigInteger, DateTime, Index

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class PodcastDownload(Base):
    """A locally downloaded podcast episode file."""

    __tablename__ = "podcast_downloads"

    id = Column(Integer, primary_key=True)
    episode_id = Column(Integer, nullable=False)
    file_path = Column(String(2000), nullable=False, unique=True)
    file_size = Column(BigInteger, nullable=True)
    downloaded_at = Column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_pd_episode_id", "episode_id"),
        Index("idx_pd_file_path", "file_path"),
        Index("idx_pd_downloaded", "downloaded_at"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "episode_id": self.episode_id,
            "file_path": self.file_path,
            "file_size": self.file_size,
            "downloaded_at": self.downloaded_at.isoformat() + "Z" if self.downloaded_at else None,
        }
