from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Text, UniqueConstraint, JSON, create_engine, select, Boolean, Index
from sqlalchemy.orm import relationship, sessionmaker, declarative_base

from .common import Base


class KeyValueStore(Base):
    __tablename__ = 'key_value_store'

    topic = Column(String(100), primary_key=True, nullable=False)
    key = Column(String(100), primary_key=True, nullable=False)
    value = Column(JSON)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    # Composite primary key constraint on (topic, key)
    __table_args__ = (
        # Additional index for topic-only queries (primary key already indexes topic+key)
        Index('idx_keyvalue_topic', 'topic'),
        Index('idx_keyvalue_key', 'key'),
    )

    def __repr__(self):
        return f'<KeyValueStore topic={self.topic} key={self.key}>'

    def to_json(self):
        return {
            'topic': self.topic,
            'key': self.key,
            'value': self.value,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
