"""Background scheduler for Garmin health data sync (3x daily)."""

from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from ..task_registry import registry

log = logging.getLogger("okaasan.health.scheduler")

_scheduler_thread: threading.Thread | None = None
_stop_event = threading.Event()

# Sync times: after sleep (8 AM), after work (5 PM), end of day (11 PM)
_SYNC_HOURS = (8, 17, 23)


def _next_sync_time(now_local: datetime) -> datetime:
    """Return the next sync target as a local datetime."""
    for h in _SYNC_HOURS:
        target = now_local.replace(hour=h, minute=0, second=0, microsecond=0)
        if now_local < target:
            return target
    # All today's slots passed — first slot tomorrow
    tomorrow = now_local + timedelta(days=1)
    return tomorrow.replace(hour=_SYNC_HOURS[0], minute=0, second=0, microsecond=0)


def _run_sync_loop(engine, config_dir: Path, tz_name: str = "UTC") -> None:
    """Background loop: sync at 8 AM, 5 PM, and 11 PM local time."""
    from sqlalchemy.orm import sessionmaker

    SL = sessionmaker(bind=engine)

    try:
        local_tz = ZoneInfo(tz_name)
    except Exception:
        log.warning("Invalid timezone %r, falling back to UTC", tz_name)
        local_tz = ZoneInfo("UTC")

    while not _stop_event.is_set():
        now_local = datetime.now(local_tz)
        target_local = _next_sync_time(now_local)
        wait_secs = (target_local - now_local).total_seconds()
        log.info("Next health sync in %.0f seconds (at %s %s)", wait_secs, target_local.strftime("%Y-%m-%d %H:%M"), tz_name)

        if _stop_event.wait(timeout=wait_secs):
            break

        today = datetime.now(timezone.utc).date()
        sync_days = [today - timedelta(days=i) for i in range(4)]

        log.info("Starting health sync for %s to %s", sync_days[-1], sync_days[0])
        registry.update("health_sync", status="running", detail=f"Syncing last {len(sync_days)} days")

        from ..notifications import hub as _hub
        _hub.publish({"type": "garmin_sync", "status": "started", "source": "scheduler"})

        total_inserted = 0
        db = SL()
        try:
            from .garmin_connect import sync_day, _get_client
            client = _get_client(config_dir)
            for day in sync_days:
                try:
                    r = sync_day(db, config_dir, day, client=client)
                    inserted = sum(
                        v.get("inserted", 0) for v in r.values() if isinstance(v, dict)
                    )
                    total_inserted += inserted
                    log.info("Health sync %s: inserted=%d", day, inserted)
                except Exception as exc:
                    log.warning("Health sync %s failed: %s", day, exc)
        except Exception as exc:
            log.error("Health sync client error: %s", exc)
            _hub.publish({"type": "garmin_sync", "status": "error", "error": str(exc), "source": "scheduler"})
            registry.update("health_sync", status="error", error=str(exc))
        else:
            _hub.publish({"type": "garmin_sync", "status": "done", "source": "scheduler", "message": f"Sync: {total_inserted} new records"})
            registry.update("health_sync", status="idle", detail=f"{total_inserted} new records")
        finally:
            db.close()


def start_scheduler(engine, config_dir: Path, sync_hour: int = 1, tz_name: str = "UTC") -> None:
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        log.info("Scheduler already running")
        return

    _stop_event.clear()
    registry.register("health_sync", "Health Sync")
    _scheduler_thread = threading.Thread(
        target=_run_sync_loop,
        args=(engine, config_dir, tz_name),
        daemon=True,
        name="health-daily-sync",
    )
    _scheduler_thread.start()
    log.info("Health sync scheduler started (3x/day at %s %s)", _SYNC_HOURS, tz_name)


def stop_scheduler() -> None:
    global _scheduler_thread
    if _scheduler_thread and _scheduler_thread.is_alive():
        _stop_event.set()
        _scheduler_thread.join(timeout=5)
        log.info("Health sync scheduler stopped")
    _scheduler_thread = None
    registry.unregister("health_sync")


def is_running() -> bool:
    return _scheduler_thread is not None and _scheduler_thread.is_alive()
