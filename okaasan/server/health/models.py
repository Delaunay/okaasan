from datetime import datetime, timezone

from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime, Boolean, JSON, Index,
    UniqueConstraint,
)

from ..models.common import Base


class HealthMetric(Base):
    """Dense time-series storage for scalar health readings."""

    __tablename__ = "health_metrics"

    _id = Column(Integer, primary_key=True)

    source = Column(String(50), nullable=False)
    metric_type = Column(String(50), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    value = Column(Float, nullable=False)
    unit = Column(String(20), default="")
    device = Column(String(100), nullable=True)
    extension = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("source", "metric_type", "timestamp", name="uq_health_metric_dedup"),
        Index("idx_hm_type_ts", "metric_type", "timestamp"),
        Index("idx_hm_source", "source"),
    )

    def __repr__(self):
        return f"<HealthMetric {self.metric_type} {self.timestamp} {self.value}>"

    def to_json(self):
        return {
            "id": self._id,
            "source": self.source,
            "metric_type": self.metric_type,
            "timestamp": self.timestamp.isoformat() + "Z" if self.timestamp else None,
            "value": self.value,
            "unit": self.unit,
            "device": self.device,
            "extension": self.extension,
        }


class HealthActivity(Base):
    """Activity / sleep events with a time span."""

    __tablename__ = "health_activities"

    _id = Column(Integer, primary_key=True)

    source = Column(String(50), nullable=False)
    source_id = Column(String(255), nullable=True)
    activity_type = Column(String(50), nullable=False)

    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    distance_m = Column(Float, nullable=True)
    calories = Column(Float, nullable=True)
    avg_hr = Column(Float, nullable=True)
    max_hr = Column(Float, nullable=True)
    min_hr = Column(Float, nullable=True)

    summary = Column(JSON, nullable=True)
    extension = Column(JSON, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("source", "source_id", name="uq_health_activity_dedup"),
        Index("idx_ha_type_start", "activity_type", "start_time"),
        Index("idx_ha_source", "source"),
    )

    def __repr__(self):
        return f"<HealthActivity {self.activity_type} {self.start_time}>"

    def to_json(self):
        return {
            "id": self._id,
            "source": self.source,
            "source_id": self.source_id,
            "activity_type": self.activity_type,
            "start_time": self.start_time.isoformat() + "Z" if self.start_time else None,
            "end_time": self.end_time.isoformat() + "Z" if self.end_time else None,
            "duration_seconds": self.duration_seconds,
            "distance_m": self.distance_m,
            "calories": self.calories,
            "avg_hr": self.avg_hr,
            "max_hr": self.max_hr,
            "min_hr": self.min_hr,
            "summary": self.summary,
            "extension": self.extension,
        }


class HealthDailySummary(Base):
    """One row per day with typed columns for daily aggregates."""

    __tablename__ = "health_daily_summaries"

    _id = Column(Integer, primary_key=True)
    source = Column(String(50), nullable=False)
    day = Column(Date, nullable=False)

    # Movement
    steps = Column(Integer)
    steps_goal = Column(Integer)
    distance_m = Column(Float)
    floors_ascended = Column(Integer)
    floors_descended = Column(Integer)

    # Calories
    calories_total = Column(Integer)
    calories_active = Column(Integer)
    calories_resting = Column(Integer)

    # Heart rate
    hr_min = Column(Integer)
    hr_max = Column(Integer)
    hr_resting = Column(Integer)

    # Stress
    stress_avg = Column(Integer)
    stress_max = Column(Integer)

    # Body battery
    bb_min = Column(Integer)
    bb_max = Column(Integer)
    bb_charged = Column(Integer)
    bb_drained = Column(Integer)
    bb_latest = Column(Integer)

    # Respiration
    rr_avg = Column(Float)
    rr_min = Column(Float)
    rr_max = Column(Float)

    # Intensity minutes
    intensity_moderate = Column(Integer)
    intensity_vigorous = Column(Integer)
    intensity_goal = Column(Integer)

    # Hydration / weight
    weight = Column(Float)
    hydration_ml = Column(Integer)

    # SpO2
    spo2_avg = Column(Float)
    spo2_min = Column(Float)

    # Sleep (daily summary view)
    sleep_seconds = Column(Integer)
    sleep_score = Column(Integer)

    # Extensible
    extension = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("source", "day", name="uq_health_daily_dedup"),
        Index("idx_hds_day", "day"),
    )

    def __repr__(self):
        return f"<HealthDailySummary {self.day}>"

    def to_json(self):
        return {
            "id": self._id,
            "source": self.source,
            "day": self.day.isoformat() if self.day else None,
            "steps": self.steps,
            "steps_goal": self.steps_goal,
            "distance_m": self.distance_m,
            "floors_ascended": self.floors_ascended,
            "floors_descended": self.floors_descended,
            "calories_total": self.calories_total,
            "calories_active": self.calories_active,
            "calories_resting": self.calories_resting,
            "hr_min": self.hr_min,
            "hr_max": self.hr_max,
            "hr_resting": self.hr_resting,
            "stress_avg": self.stress_avg,
            "stress_max": self.stress_max,
            "bb_min": self.bb_min,
            "bb_max": self.bb_max,
            "bb_charged": self.bb_charged,
            "bb_drained": self.bb_drained,
            "bb_latest": self.bb_latest,
            "rr_avg": self.rr_avg,
            "rr_min": self.rr_min,
            "rr_max": self.rr_max,
            "intensity_moderate": self.intensity_moderate,
            "intensity_vigorous": self.intensity_vigorous,
            "intensity_goal": self.intensity_goal,
            "weight": self.weight,
            "hydration_ml": self.hydration_ml,
            "spo2_avg": self.spo2_avg,
            "spo2_min": self.spo2_min,
            "sleep_seconds": self.sleep_seconds,
            "sleep_score": self.sleep_score,
            "extension": self.extension,
        }


class HealthConnector(Base):
    """Connector configuration and credential storage."""

    __tablename__ = "health_connectors"

    _id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False)
    enabled = Column(Boolean, default=True)
    config = Column(JSON, nullable=True)
    last_sync = Column(DateTime, nullable=True)
    last_error = Column(String(500), nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def __repr__(self):
        return f"<HealthConnector {self.name}>"

    def to_json(self):
        return {
            "id": self._id,
            "name": self.name,
            "enabled": self.enabled,
            "config": self.config,
            "last_sync": self.last_sync.isoformat() + "Z" if self.last_sync else None,
            "last_error": self.last_error,
        }
