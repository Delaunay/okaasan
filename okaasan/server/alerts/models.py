"""SQLAlchemy models for the alert system — stored in alerts.db."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, Float, String, DateTime, Index, Text, JSON,
)
from sqlalchemy.orm import declarative_base

AlertsBase = declarative_base()


def _utcnow():
    return datetime.now(timezone.utc)


class AlertRule(AlertsBase):
    """A user-defined rule that triggers an alert when a metric condition is met."""
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    enabled = Column(Integer, nullable=False, default=1)
    source = Column(String(100), nullable=False)
    metric_path = Column(String(300), nullable=False)
    condition = Column(String(20), nullable=False)  # gt, lt, gte, lte, eq, neq, contains
    threshold = Column(Text, nullable=False)  # JSON-encoded value
    urgency = Column(String(20), nullable=False, default="info")  # critical, warning, info
    cooldown_seconds = Column(Integer, nullable=False, default=3600)
    resolve_on_clear = Column(Integer, nullable=False, default=1)
    broadcaster_ids = Column(Text, nullable=False, default="[]")  # JSON list of IDs
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_rules_source", "source"),
    )

    def to_json(self) -> dict:
        import json
        return {
            "id": self.id,
            "name": self.name,
            "enabled": bool(self.enabled),
            "source": self.source,
            "metric_path": self.metric_path,
            "condition": self.condition,
            "threshold": json.loads(self.threshold) if self.threshold else None,
            "urgency": self.urgency,
            "cooldown_seconds": self.cooldown_seconds,
            "resolve_on_clear": bool(self.resolve_on_clear),
            "broadcaster_ids": json.loads(self.broadcaster_ids) if self.broadcaster_ids else [],
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
            "updated_at": self.updated_at.isoformat() + "Z" if self.updated_at else None,
        }


class AlertBroadcaster(AlertsBase):
    """A configured output channel (e.g. Telegram bot, webhook)."""
    __tablename__ = "alert_broadcasters"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    type = Column(String(50), nullable=False)  # telegram, webhook
    config = Column(Text, nullable=False, default="{}")  # JSON
    enabled = Column(Integer, nullable=False, default=1)

    def to_json(self) -> dict:
        import json
        cfg = json.loads(self.config) if self.config else {}
        # Mask sensitive fields
        masked = {}
        for k, v in cfg.items():
            if "token" in k.lower() or "secret" in k.lower():
                masked[k] = v[:8] + "..." if v and len(v) > 8 else "***"
            else:
                masked[k] = v
        return {
            "id": self.id,
            "name": self.name,
            "type": self.type,
            "config": masked,
            "enabled": bool(self.enabled),
        }

    def get_config(self) -> dict:
        """Return full unmasked config (for internal use)."""
        import json
        return json.loads(self.config) if self.config else {}


class AlertEvent(AlertsBase):
    """A record of an alert that was fired."""
    __tablename__ = "alert_events"

    id = Column(Integer, primary_key=True)
    rule_id = Column(Integer, nullable=False, index=True)
    fired_at = Column(DateTime, nullable=False, default=_utcnow)
    resolved_at = Column(DateTime, nullable=True)
    value_snapshot = Column(Text, nullable=True)  # JSON
    message = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="active")  # active, resolved, acknowledged

    __table_args__ = (
        Index("idx_events_rule_status", "rule_id", "status"),
        Index("idx_events_fired", "fired_at"),
    )

    def to_json(self) -> dict:
        import json
        return {
            "id": self.id,
            "rule_id": self.rule_id,
            "fired_at": self.fired_at.isoformat() + "Z" if self.fired_at else None,
            "resolved_at": self.resolved_at.isoformat() + "Z" if self.resolved_at else None,
            "value_snapshot": json.loads(self.value_snapshot) if self.value_snapshot else None,
            "message": self.message,
            "status": self.status,
        }


class AlertDestination(AlertsBase):
    """Links a broadcaster to a specific user/target."""
    __tablename__ = "alert_destinations"

    id = Column(Integer, primary_key=True)
    broadcaster_id = Column(Integer, nullable=False, index=True)
    label = Column(String(200), nullable=False)
    target = Column(String(300), nullable=False)  # e.g. chat_id for Telegram

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "broadcaster_id": self.broadcaster_id,
            "label": self.label,
            "target": self.target,
        }
