"""SQLAlchemy models for retro games tracking."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Boolean, Index
from sqlalchemy.orm import relationship

from ..models.common import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Game(Base):
    """Canonical record for a game in the library."""

    __tablename__ = "games_media"

    id = Column(Integer, primary_key=True)
    title = Column(String(500), nullable=False)
    platform = Column(String(50), nullable=True)
    year = Column(Integer, nullable=True)
    genre = Column(String(200), nullable=True)
    developer = Column(String(300), nullable=True)
    publisher = Column(String(300), nullable=True)
    description = Column(Text, nullable=True)
    cover_path = Column(String(500), nullable=True)
    igdb_id = Column(Integer, nullable=True)
    players = Column(Integer, nullable=True)
    rating = Column(Float, nullable=True)
    favorite = Column(Boolean, nullable=False, server_default="0")
    created_at = Column(DateTime, default=_utcnow)

    save_states = relationship("GameSaveState", back_populates="game", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_games_title", "title"),
        Index("idx_games_platform", "platform"),
        Index("idx_games_igdb", "igdb_id"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "platform": self.platform,
            "year": self.year,
            "genre": self.genre,
            "developer": self.developer,
            "publisher": self.publisher,
            "description": self.description,
            "cover_path": self.cover_path,
            "igdb_id": self.igdb_id,
            "players": self.players,
            "rating": self.rating,
            "favorite": bool(self.favorite),
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }


class GameSaveState(Base):
    """Save state data for a game."""

    __tablename__ = "games_save_states"

    id = Column(Integer, primary_key=True)
    game_id = Column(Integer, ForeignKey("games_media.id", ondelete="CASCADE"), nullable=False)
    slot_number = Column(Integer, nullable=False)
    data_path = Column(String(1000), nullable=False)
    screenshot_path = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    game = relationship("Game", back_populates="save_states")

    __table_args__ = (
        Index("idx_gss_game", "game_id"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "game_id": self.game_id,
            "slot_number": self.slot_number,
            "data_path": self.data_path,
            "screenshot_path": self.screenshot_path,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }
