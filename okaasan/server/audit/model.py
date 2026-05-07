from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, DateTime, JSON, Index

from ..models.common import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    _id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    action = Column(String(10))
    entity_type = Column(String(50))
    entity_id = Column(Integer)

    title = Column(String(255))
    summary = Column(String(500))

    changes = Column(JSON)
    extra = Column(JSON)

    created_by = Column(String(100))
    owner = Column(String(100))

    __table_args__ = (
        Index("ix_audit_entity_type_timestamp", "entity_type", "timestamp"),
        Index("ix_audit_created_by", "created_by"),
        Index("ix_audit_owner", "owner"),
    )

    def to_json(self):
        return {
            "id": self._id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "action": self.action,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "title": self.title,
            "summary": self.summary,
            "changes": self.changes,
            "extra": self.extra,
            "created_by": self.created_by,
            "owner": self.owner,
        }
