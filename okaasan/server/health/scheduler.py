"""Background scheduler for daily Garmin health data sync."""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("okaasan.health.scheduler")

_scheduler_thread: threading.Thread | None = None
_stop_event = threading.Event()


def _run_daily_sync(engine, config_dir: Path, sync_hour: int = 1) -> None:
    """Background loop: sync yesterday's data once per day at *sync_hour* UTC."""
    from sqlalchemy.orm import sessionmaker

    SL = sessionmaker(bind=engine)

    while not _stop_event.is_set():
        now = datetime.now(timezone.utc)
        target = now.replace(hour=sync_hour, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        wait_secs = (target - now).total_seconds()
        log.info("Next daily sync in %.0f seconds (at %s UTC)", wait_secs, target.isoformat())

        if _stop_event.wait(timeout=wait_secs):
            break

        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()
        today = datetime.now(timezone.utc).date()

        log.info("Starting daily sync for %s and %s", yesterday, today)
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
                    log.info("Daily sync %s: inserted=%d", day, inserted)
                except Exception as exc:
                    log.warning("Daily sync %s failed: %s", day, exc)
        except Exception as exc:
            log.error("Daily sync client error: %s", exc)
        finally:
            db.close()


def start_scheduler(engine, config_dir: Path, sync_hour: int = 1) -> None:
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        log.info("Scheduler already running")
        return

    _stop_event.clear()
    _scheduler_thread = threading.Thread(
        target=_run_daily_sync,
        args=(engine, config_dir, sync_hour),
        daemon=True,
        name="health-daily-sync",
    )
    _scheduler_thread.start()
    log.info("Daily health sync scheduler started (sync_hour=%d UTC)", sync_hour)


def stop_scheduler() -> None:
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        _stop_event.set()
        _scheduler_thread.join(timeout=5)
        log.info("Daily health sync scheduler stopped")
    _scheduler_thread = None


def is_running() -> bool:
    return _scheduler_thread is not None and _scheduler_thread.is_alive()
