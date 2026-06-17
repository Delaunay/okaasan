"""Metric source: Health data (Garmin, FIT imports)."""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any

from . import MetricSource


class HealthMetricSource(MetricSource):
    def __init__(self, session_factory):
        self._session_factory = session_factory

    @property
    def source_id(self) -> str:
        return "health"

    @property
    def display_name(self) -> str:
        return "Health"

    def collect(self) -> dict[str, Any]:
        try:
            from ...health.models import HealthMetric

            session = self._session_factory()
            try:
                now = datetime.now(timezone.utc)
                yesterday = now - timedelta(hours=24)

                recent = (
                    session.query(HealthMetric)
                    .filter(HealthMetric.timestamp >= yesterday)
                    .order_by(HealthMetric.timestamp.desc())
                    .limit(200)
                    .all()
                )

                result: dict[str, Any] = {}
                latest: dict[str, Any] = {}

                for m in recent:
                    key = m.metric_type
                    if key not in latest:
                        latest[key] = m.value
                        result[f"latest.{key}"] = m.value

                result["recent.count"] = len(recent)
                return result
            finally:
                session.close()
        except Exception:
            return {}

    def list_metrics(self) -> list[dict[str, str]]:
        return [
            {"path": "latest.heart_rate", "label": "Latest heart rate", "unit": "bpm"},
            {"path": "latest.steps", "label": "Latest steps", "unit": "steps"},
            {"path": "latest.stress", "label": "Latest stress level", "unit": ""},
            {"path": "latest.body_battery", "label": "Body battery", "unit": "%"},
            {"path": "latest.spo2", "label": "SpO2", "unit": "%"},
            {"path": "recent.count", "label": "Recent data points (24h)", "unit": ""},
        ]
