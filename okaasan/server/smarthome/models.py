"""SQLAlchemy models for smart home sensor data — stored in a separate smarthome.db."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, Float, String, DateTime, Index, JSON,
)
from sqlalchemy.orm import declarative_base

SmartHomeBase = declarative_base()


def _utcnow():
    return datetime.now(timezone.utc)


class SensorReading(SmartHomeBase):
    """A single timestamped measurement from a sensor."""
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True)
    device_name = Column(String(200), nullable=False, index=True)
    metric = Column(String(100), nullable=False, index=True)
    value = Column(Float, nullable=False)
    recorded_at = Column(DateTime, nullable=False, default=_utcnow)

    __table_args__ = (
        Index("idx_readings_device_metric_time", "device_name", "metric", "recorded_at"),
    )

    def to_json(self) -> dict:
        ts = None
        if self.recorded_at:
            ts = self.recorded_at.isoformat() + "Z"
        return {
            "id": self.id,
            "device_name": self.device_name,
            "metric": self.metric,
            "value": self.value,
            "recorded_at": ts,
        }


class SensorConfig(SmartHomeBase):
    """Per-sensor recording configuration."""
    __tablename__ = "sensor_config"

    id = Column(Integer, primary_key=True)
    device_name = Column(String(200), nullable=False)
    metric = Column(String(100), nullable=False)
    interval_seconds = Column(Integer, nullable=False, default=60)
    enabled = Column(Integer, nullable=False, default=1)

    __table_args__ = (
        Index("idx_config_device_metric", "device_name", "metric", unique=True),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "device_name": self.device_name,
            "metric": self.metric,
            "interval_seconds": self.interval_seconds,
            "enabled": bool(self.enabled),
        }
