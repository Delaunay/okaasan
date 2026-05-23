"""SQLAlchemy models for computer management and background tasks."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Float, DateTime, Text, JSON, Index
from sqlalchemy.orm import declarative_base

TaskBase = declarative_base()


def _utcnow():
    return datetime.now(timezone.utc)


class TaskRun(TaskBase):
    """Tracks a background task execution (e.g. AV1 video conversion).

    Lives in its own private DB (computer_tasks.db), not the main database.
    """

    __tablename__ = "computer_tasks"

    id = Column(Integer, primary_key=True)
    computer_id = Column(String(100), nullable=False, default="local")
    task_type = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    config = Column(JSON, nullable=True)
    manifest = Column(JSON, nullable=True)
    current_file = Column(String(1000), nullable=True)
    files_total = Column(Integer, nullable=False, default=0)
    files_done = Column(Integer, nullable=False, default=0)
    bytes_saved = Column(Float, nullable=False, default=0.0)
    error = Column(Text, nullable=True)
    logs = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_ctask_computer", "computer_id"),
        Index("idx_ctask_status", "status"),
    )

    @property
    def progress_pct(self) -> float:
        if self.files_total == 0:
            return 0.0
        return round((self.files_done / self.files_total) * 100, 1)

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "computer_id": self.computer_id,
            "task_type": self.task_type,
            "status": self.status,
            "config": self.config,
            "manifest": self.manifest,
            "current_file": self.current_file,
            "files_total": self.files_total,
            "files_done": self.files_done,
            "progress_pct": self.progress_pct,
            "bytes_saved": self.bytes_saved,
            "error": self.error,
            "logs": self.logs,
            "started_at": self.started_at.isoformat() + "Z" if self.started_at else None,
            "completed_at": self.completed_at.isoformat() + "Z" if self.completed_at else None,
            "created_at": self.created_at.isoformat() + "Z" if self.created_at else None,
        }
