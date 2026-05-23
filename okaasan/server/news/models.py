"""SQLAlchemy models for world news aggregation."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, Index,
)

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class NewsSource(Base):
    """An RSS feed source (BBC, AP, Al Jazeera, etc.)."""

    __tablename__ = "news_sources"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    feed_url = Column(String(2000), nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default="1")
    last_fetched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "feed_url": self.feed_url,
            "enabled": self.enabled,
            "last_fetched_at": self.last_fetched_at.isoformat() + "Z" if self.last_fetched_at else None,
        }


class NewsArticle(Base):
    """A single news article fetched from an RSS feed."""

    __tablename__ = "news_articles"

    id = Column(Integer, primary_key=True)
    source_id = Column(Integer, nullable=False)
    source_name = Column(String(200), nullable=False)
    title = Column(String(1000), nullable=False)
    description = Column(Text, nullable=True)
    url = Column(String(2000), nullable=False)
    image_url = Column(String(2000), nullable=True)
    published_at = Column(DateTime, nullable=True)
    guid = Column(String(2000), nullable=False)
    categories = Column(String(1000), nullable=True)
    group_id = Column(Integer, nullable=True)
    fetched_at = Column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_na_source", "source_id"),
        Index("idx_na_published", "published_at"),
        Index("idx_na_group", "group_id"),
        Index("idx_na_guid", "guid"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "source_id": self.source_id,
            "source_name": self.source_name,
            "title": self.title,
            "description": self.description,
            "url": self.url,
            "image_url": self.image_url,
            "published_at": self.published_at.isoformat() + "Z" if self.published_at else None,
            "guid": self.guid,
            "categories": self.categories.split("|") if self.categories else [],
            "group_id": self.group_id,
            "fetched_at": self.fetched_at.isoformat() + "Z" if self.fetched_at else None,
        }


class NewsGroup(Base):
    """A group of articles covering the same story across sources."""

    __tablename__ = "news_groups"

    id = Column(Integer, primary_key=True)
    title = Column(String(1000), nullable=False)
    created_at = Column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_ng_created", "created_at"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }
