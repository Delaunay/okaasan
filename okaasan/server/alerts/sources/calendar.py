"""Metric source: Calendar events."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import MetricSource


class CalendarMetricSource(MetricSource):
    def __init__(self, session_factory):
        self._session_factory = session_factory

    @property
    def source_id(self) -> str:
        return "calendar"

    @property
    def display_name(self) -> str:
        return "Calendar"

    def collect(self) -> dict[str, Any]:
        from ...calendar.models import Event

        session = self._session_factory()
        try:
            now = datetime.now(timezone.utc)
            upcoming = (
                session.query(Event)
                .filter(Event.start >= now)
                .order_by(Event.start)
                .limit(10)
                .all()
            )
            result: dict[str, Any] = {}
            result["upcoming.count"] = len(upcoming)

            if upcoming:
                next_evt = upcoming[0]
                delta = (next_evt.start - now).total_seconds() / 60.0
                result["next_event.minutes_until"] = round(delta, 1)
                result["next_event.title"] = next_evt.title or ""

            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            today_end = today_start.replace(hour=23, minute=59, second=59)
            today_count = (
                session.query(Event)
                .filter(Event.start >= today_start, Event.start <= today_end)
                .count()
            )
            result["today.count"] = today_count

            return result
        except Exception:
            return {}
        finally:
            session.close()

    def list_metrics(self) -> list[dict[str, str]]:
        return [
            {"path": "upcoming.count", "label": "Upcoming events count", "unit": ""},
            {"path": "next_event.minutes_until", "label": "Minutes until next event", "unit": "min"},
            {"path": "next_event.title", "label": "Next event title", "unit": ""},
            {"path": "today.count", "label": "Today's events count", "unit": ""},
        ]
