"""SQLAlchemy models for shows/movies tracking."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, DateTime, JSON, Index,
    UniqueConstraint, ForeignKey, Text,
)
from sqlalchemy.orm import relationship

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


def _uuid():
    return str(uuid.uuid4())


class Media(Base):
    """Canonical record for a show or movie."""

    __tablename__ = "shows_media"

    id = Column(Integer, primary_key=True)
    media_type = Column(String(10), nullable=False)  # "show" or "movie"
    title = Column(String(500), nullable=False)
    year = Column(Integer, nullable=True)
    slug = Column(String(500), nullable=True)

    trakt_id = Column(Integer, nullable=True)
    tmdb_id = Column(Integer, nullable=True)
    imdb_id = Column(String(20), nullable=True)
    tvdb_id = Column(Integer, nullable=True)

    genres = Column(JSON, nullable=True)
    country = Column(String(10), nullable=True)
    runtime = Column(Integer, nullable=True)
    status = Column(String(50), nullable=True)
    overview = Column(Text, nullable=True)

    poster_path = Column(String(500), nullable=True)
    backdrop_path = Column(String(500), nullable=True)
    user_status = Column(String(20), nullable=True)  # "dropped", "completed", etc.

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    watch_history = relationship("WatchHistory", back_populates="media", cascade="all, delete-orphan")
    watchlist_entry = relationship("WatchlistItem", back_populates="media", cascade="all, delete-orphan")
    rating = relationship("UserRating", back_populates="media", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("media_type", "trakt_id", name="uq_media_trakt"),
        Index("idx_media_tmdb", "media_type", "tmdb_id"),
        Index("idx_media_title", "title"),
    )

    def to_json(self):
        return {
            "id": self.id,
            "media_type": self.media_type,
            "title": self.title,
            "year": self.year,
            "slug": self.slug,
            "trakt_id": self.trakt_id,
            "tmdb_id": self.tmdb_id,
            "imdb_id": self.imdb_id,
            "tvdb_id": self.tvdb_id,
            "genres": self.genres,
            "country": self.country,
            "runtime": self.runtime,
            "status": self.status,
            "overview": self.overview,
            "poster_path": self.poster_path,
            "backdrop_path": self.backdrop_path,
            "user_status": self.user_status,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }


class WatchHistory(Base):
    """Each time user watched something."""

    __tablename__ = "shows_watch_history"

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("shows_media.id", ondelete="CASCADE"), nullable=False)
    watched_at = Column(DateTime, nullable=False)
    season = Column(Integer, nullable=True)
    episode = Column(Integer, nullable=True)
    source = Column(String(20), nullable=False, default="manual")  # "trakt_import" or "manual"
    created_at = Column(DateTime, default=_utcnow)

    media = relationship("Media", back_populates="watch_history")

    __table_args__ = (
        Index("idx_wh_media", "media_id"),
        Index("idx_wh_watched_at", "watched_at"),
        UniqueConstraint("media_id", "watched_at", "season", "episode", "source", name="uq_watch_history_dedup"),
    )

    def to_json(self):
        return {
            "id": self.id,
            "media_id": self.media_id,
            "watched_at": self.watched_at.isoformat() + "Z" if self.watched_at else None,
            "season": self.season,
            "episode": self.episode,
            "source": self.source,
        }
 

class WatchlistItem(Base):
    """Items the user wants to watch."""

    __tablename__ = "shows_watchlist"

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("shows_media.id", ondelete="CASCADE"), nullable=False, unique=True)
    rank = Column(Integer, nullable=True)
    listed_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    source = Column(String(20), nullable=False, default="manual")
    created_at = Column(DateTime, default=_utcnow)

    media = relationship("Media", back_populates="watchlist_entry")

    __table_args__ = (
        Index("idx_watchlist_rank", "rank"),
    )

    def to_json(self):
        return {
            "id": self.id,
            "media_id": self.media_id,
            "rank": self.rank,
            "listed_at": self.listed_at.isoformat() + "Z" if self.listed_at else None,
            "notes": self.notes,
            "source": self.source,
        }


class UserRating(Base):
    """User's rating for a show/movie."""

    __tablename__ = "shows_user_ratings"

    id = Column(Integer, primary_key=True)
    media_id = Column(Integer, ForeignKey("shows_media.id", ondelete="CASCADE"), nullable=False, unique=True)
    rating = Column(Integer, nullable=False)
    rated_at = Column(DateTime, nullable=True)
    source = Column(String(20), nullable=False, default="manual")

    media = relationship("Media", back_populates="rating")

    def to_json(self):
        return {
            "id": self.id,
            "media_id": self.media_id,
            "rating": self.rating,
            "rated_at": self.rated_at.isoformat() + "Z" if self.rated_at else None,
            "source": self.source,
        }


class Collection(Base):
    """A named playlist/grouping of media."""

    __tablename__ = "shows_collections"

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    collection_type = Column(String(20), nullable=False, default="user")  # "user", "trakt_owned", "favorites"
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    items = relationship("CollectionItem", back_populates="collection", cascade="all, delete-orphan", order_by="CollectionItem.rank")

    def to_json(self, include_items=False):
        result = {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "collection_type": self.collection_type,
            "item_count": len(self.items) if self.items else 0,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }
        if include_items:
            result["items"] = [i.to_json() for i in self.items]
        return result


class CollectionItem(Base):
    """An item within a collection."""

    __tablename__ = "shows_collection_items"

    id = Column(Integer, primary_key=True)
    collection_id = Column(String(36), ForeignKey("shows_collections.id", ondelete="CASCADE"), nullable=False)
    media_id = Column(Integer, ForeignKey("shows_media.id", ondelete="CASCADE"), nullable=False)
    rank = Column(Integer, nullable=True)
    added_at = Column(DateTime, default=_utcnow)
    notes = Column(Text, nullable=True)

    collection = relationship("Collection", back_populates="items")
    media = relationship("Media")

    __table_args__ = (
        UniqueConstraint("collection_id", "media_id", name="uq_collection_media"),
        Index("idx_ci_collection", "collection_id"),
    )

    def to_json(self):
        result = self.media.to_json() if self.media else {}
        result.update({
            "collection_item_id": self.id,
            "rank": self.rank,
            "added_at": self.added_at.isoformat() + "Z" if self.added_at else None,
            "notes": self.notes,
        })
        return result
