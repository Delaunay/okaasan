"""SQLAlchemy models for podcast tracking."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, BigInteger,
    ForeignKey, Index, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Podcast(Base):
    """A subscribed podcast feed."""

    __tablename__ = "podcasts_media"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    author = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    cover_path = Column(String(500), nullable=True)
    feed_url = Column(String(2000), nullable=False, unique=True)
    podcast_index_id = Column(Integer, nullable=True)
    last_fetched_at = Column(DateTime, nullable=True)
    category = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    episodes = relationship(
        "PodcastEpisode", back_populates="podcast", cascade="all, delete-orphan",
        order_by="PodcastEpisode.published_at.desc()",
    )

    __table_args__ = (
        Index("idx_podcast_title", "title"),
        Index("idx_podcast_index_id", "podcast_index_id"),
    )

    def to_json(self, include_episodes: bool = False) -> dict:
        result = {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "description": self.description,
            "cover_path": self.cover_path,
            "feed_url": self.feed_url,
            "podcast_index_id": self.podcast_index_id,
            "last_fetched_at": self.last_fetched_at.isoformat() + "Z" if self.last_fetched_at else None,
            "category": self.category,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "episode_count": len(self.episodes) if self.episodes else 0,
        }
        if include_episodes:
            result["episodes"] = [ep.to_json() for ep in self.episodes]
        return result


class PodcastEpisode(Base):
    """A single episode within a podcast."""

    __tablename__ = "podcasts_episodes"

    id = Column(Integer, primary_key=True)
    podcast_id = Column(Integer, ForeignKey("podcasts_media.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    audio_url = Column(String(2000), nullable=True)
    duration_ms = Column(BigInteger, nullable=True)
    published_at = Column(DateTime, nullable=True)
    episode_number = Column(Integer, nullable=True)
    season_number = Column(Integer, nullable=True)
    guid = Column(String(1000), nullable=False)

    podcast = relationship("Podcast", back_populates="episodes")
    progress = relationship("PodcastProgress", back_populates="episode", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("podcast_id", "guid", name="uq_episode_guid_per_podcast"),
        Index("idx_episode_podcast", "podcast_id"),
        Index("idx_episode_published", "published_at"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "podcast_id": self.podcast_id,
            "title": self.title,
            "description": self.description,
            "audio_url": self.audio_url,
            "duration_ms": self.duration_ms,
            "published_at": self.published_at.isoformat() + "Z" if self.published_at else None,
            "episode_number": self.episode_number,
            "season_number": self.season_number,
            "guid": self.guid,
            "progress": self.progress.to_json() if self.progress else None,
        }


class PodcastProgress(Base):
    """Playback progress for an episode."""

    __tablename__ = "podcasts_progress"

    id = Column(Integer, primary_key=True)
    episode_id = Column(Integer, ForeignKey("podcasts_episodes.id", ondelete="CASCADE"), nullable=False, unique=True)
    position_ms = Column(BigInteger, nullable=False, default=0)
    completed = Column(Boolean, nullable=False, default=False)
    last_listened_at = Column(DateTime, default=_utcnow)

    episode = relationship("PodcastEpisode", back_populates="progress")

    __table_args__ = (
        Index("idx_progress_episode", "episode_id"),
        Index("idx_progress_listened", "last_listened_at"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "episode_id": self.episode_id,
            "position_ms": self.position_ms,
            "completed": self.completed,
            "last_listened_at": self.last_listened_at.isoformat() + "Z" if self.last_listened_at else None,
        }
