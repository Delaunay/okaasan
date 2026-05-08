"""Background scheduler for daily Garmin health data sync."""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

log = logging.getLogger("okaasan.health.scheduler")

_scheduler_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _run_daily_sync(engine, config_dir: Path, sync_hour: int = 1, tz_name: str = "UTC") -> None:
    """Background loop: sync yesterday's data once per day at *sync_hour* local time."""
    from sqlalchemy.orm import sessionmaker

    SL = sessionmaker(bind=engine)

    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        log.warning("Invalid timezone %r, falling back to UTC", tz_name)
        local_tz = ZoneInfo("UTC")

    while not _stop_event.is_set():
        now_local = datetime.now(local_tz)
        target_local = now_local.replace(hour=sync_hour, minute=0, second=0, microsecond=0)
        if now_local >= target_local:
            target_local += timedelta(days=1)
        wait_secs = (target_local - now_local).total_seconds()
        log.info("Next daily sync in %.0f seconds (at %s %s)", wait_secs, target_local.strftime("%Y-%m-%d %H:%M"), tz_name)

        if _stop_event.wait(timeout=wait_secs):
            break

        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()
        today = datetime.now(timezone.utc).date()

        log.info("Starting daily sync for %s and %s", yesterday, today)

        from ..notifications import hub as _hub
        _hub.publish({"type": "garmin_sync", "status": "started", "source": "scheduler"})

        total_inserted = 0
        db = SL()
        try:
            from .garmin_connect import sync_day, _get_client
            client = _get_client(config_dir)
            for day in (yesterday, today):
                try:
                    r = sync_day(db, config_dir, day, client=client)
                    inserted = sum(
                        v.get("inserted", 0) for v in r.values() if isinstance(v, dict)
                    )
                    total_inserted += inserted
                    log.info("Daily sync %s: inserted=%d", day, inserted)
                except Exception as exc:
                    log.warning("Daily sync %s failed: %s", day, exc)
        except Exception as exc:
            log.error("Daily sync client error: %s", exc)
            _hub.publish({"type": "garmin_sync", "status": "error", "error": str(exc), "source": "scheduler"})
        else:
            _hub.publish({"type": "garmin_sync", "status": "done", "source": "scheduler", "message": f"Daily sync: {total_inserted} new records"})
        finally:
            db.close()


def start_scheduler(engine, config_dir: Path, sync_hour: int = 1, tz_name: str = "UTC") -> None:
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        log.info("Scheduler already running")
        return

    _stop_event.clear()
    _scheduler_thread = threading.Thread(
        target=_run_daily_sync,
        args=(engine, config_dir, sync_hour, tz_name),
        daemon=True,
        name="health-daily-sync",
    )
    _scheduler_thread.start()
    log.info("Daily health sync scheduler started (sync_hour=%d %s)", sync_hour, tz_name)


def stop_scheduler() -> None:
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        _stop_event.set()
        _scheduler_thread.join(timeout=5)
        log.info("Daily health sync scheduler stopped")
    _scheduler_thread = None


def is_running() -> bool:
    return _scheduler_thread is not None and _scheduler_thread.is_alive()
