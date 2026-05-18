"""Unified registry for observable background tasks.

Provides a singleton ``registry`` that background tasks register with
so their status is visible to users via WebSocket and REST.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

log = logging.getLogger("okaasan.task_registry")

_DEBOUNCE_SECONDS = 0.5


@dataclass
class TaskInfo:
    id: str
    name: str
    status: str = "idle"
    detail: str = ""
    started_at: str = ""
    last_activity: str = ""
    progress: float | None = None
    error: str = ""


class TaskRegistry:
    def __init__(self):
        self._tasks: dict[str, TaskInfo] = {}
        self._lock = threading.Lock()
        self._debounce_timer: threading.Timer | None = None

    def register(self, task_id: str, name: str, status: str = "idle") -> None:
        with self._lock:
            self._tasks[task_id] = TaskInfo(
                id=task_id,
                name=name,
                status=status,
                last_activity=_now_iso(),
            )
        self._schedule_broadcast()

    def update(
        self,
        task_id: str,
        *,
        status: str | None = None,
        detail: str | None = None,
        progress: float | None = ...,  # type: ignore[assignment]
        error: str | None = None,
    ) -> None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return
            if status is not None:
                task.status = status
                if status == "running" and not task.started_at:
                    task.started_at = _now_iso()
                if status in ("idle", "stopped", "error"):
                    task.started_at = ""
            if detail is not None:
                task.detail = detail
            if progress is not ...:
                task.progress = progress
            if error is not None:
                task.error = error
            task.last_activity = _now_iso()
        self._schedule_broadcast()

    def unregister(self, task_id: str) -> None:
        with self._lock:
            self._tasks.pop(task_id, None)
        self._schedule_broadcast()

    def snapshot(self) -> list[dict]:
        with self._lock:
            return [asdict(t) for t in self._tasks.values()]

    def _schedule_broadcast(self) -> None:
        if self._debounce_timer is not None:
            self._debounce_timer.cancel()
        self._debounce_timer = threading.Timer(
            _DEBOUNCE_SECONDS, self._do_broadcast
        )
        self._debounce_timer.daemon = True
        self._debounce_timer.start()

    def _do_broadcast(self) -> None:
        from .notifications import hub
        hub.publish({
            "type": "task_status",
            "tasks": self.snapshot(),
        })


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


registry = TaskRegistry()
