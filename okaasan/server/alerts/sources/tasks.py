"""Metric source: Tasks and reminders."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import MetricSource


class TasksMetricSource(MetricSource):
    def __init__(self, session_factory):
        self._session_factory = session_factory

    @property
    def source_id(self) -> str:
        return "tasks"

    @property
    def display_name(self) -> str:
        return "Tasks"

    def collect(self) -> dict[str, Any]:
        try:
            from ...tasks.models import Task

            session = self._session_factory()
            try:
                all_tasks = session.query(Task).all()
                result: dict[str, Any] = {}

                pending = [t for t in all_tasks if not getattr(t, "completed", False)]
                completed = [t for t in all_tasks if getattr(t, "completed", False)]
                overdue = []

                now = datetime.now(timezone.utc)
                for t in pending:
                    due = getattr(t, "due_date", None)
                    if due and due < now:
                        overdue.append(t)

                result["pending.count"] = len(pending)
                result["completed.count"] = len(completed)
                result["overdue.count"] = len(overdue)
                result["total.count"] = len(all_tasks)

                return result
            finally:
                session.close()
        except Exception:
            return {}

    def list_metrics(self) -> list[dict[str, str]]:
        return [
            {"path": "pending.count", "label": "Pending tasks", "unit": ""},
            {"path": "completed.count", "label": "Completed tasks", "unit": ""},
            {"path": "overdue.count", "label": "Overdue tasks", "unit": ""},
            {"path": "total.count", "label": "Total tasks", "unit": ""},
        ]
