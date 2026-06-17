"""Background scheduler for periodic investing data refresh.

Targets 3 option chain snapshots per trading day: open (~9:35 ET), midday (~12:00 ET), close (~16:05 ET).
Stock prices are refreshed alongside each snapshot.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import sessionmaker

log = logging.getLogger("okaasan.investing.scheduler")

# US market session targets in Eastern time (hour, minute)
_MARKET_SESSIONS = [
    (9, 35),   # open
    (12, 0),   # midday
    (16, 5),   # close
]


def _et_now() -> datetime:
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo  # type: ignore
    return datetime.now(ZoneInfo("America/New_York"))


def _seconds_until_next_session() -> float:
    """Seconds until the next market session target, or 60s fallback during off-hours."""
    now = _et_now()
    weekday = now.weekday()

    # Skip weekends entirely — sleep until Monday 9:30
    if weekday >= 5:
        days_ahead = 7 - weekday  # Saturday=5→2, Sunday=6→1
        next_monday = now.replace(hour=9, minute=30, second=0, microsecond=0) + timedelta(days=days_ahead)
        return max((next_monday - now).total_seconds(), 60)

    for h, m in _MARKET_SESSIONS:
        target = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if target > now:
            return (target - now).total_seconds()

    # All sessions passed today — aim for tomorrow's open
    tomorrow = now + timedelta(days=1)
    if tomorrow.weekday() >= 5:
        days_ahead = 7 - tomorrow.weekday()
        tomorrow = tomorrow + timedelta(days=days_ahead)
    next_open = tomorrow.replace(hour=9, minute=35, second=0, microsecond=0)
    return max((next_open - now).total_seconds(), 60)


def _is_market_hours() -> bool:
    """True if current ET time is within trading window (9:30–16:15, Mon–Fri)."""
    now = _et_now()
    if now.weekday() >= 5:
        return False
    t = now.hour * 60 + now.minute
    return 9 * 60 + 25 <= t <= 16 * 60 + 15


class InvestingScheduler:
    """Refreshes stock prices and option chains 3x per trading day (open/midday/close)."""

    def __init__(
        self,
        session_factory: sessionmaker,
        investing_session_factory: sessionmaker,
        static_folder: str,
        interval_minutes: int = 60,
    ):
        self._session_factory = session_factory
        self._inv_session_factory = investing_session_factory
        self._static_folder = static_folder
        self._interval = interval_minutes * 60  # fallback for off-hours price refresh
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.last_refresh: datetime | None = None
        self.last_error: str | None = None
        self._completed_sessions: set[str] = set()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, name="investing-scheduler", daemon=True,
        )
        self._thread.start()
        log.info("Investing scheduler started (3x/day market hours + fallback %ds)", self._interval)

    def stop(self):
        self._stop.set()

    def refresh_now(self) -> dict:
        return self._do_refresh()

    def _loop(self):
        self._stop.wait(30)

        while not self._stop.is_set():
            if _is_market_hours():
                self._do_refresh()
                wait = _seconds_until_next_session()
                # Reset completed sessions at midnight ET
                now_et = _et_now()
                today_key = now_et.strftime("%Y-%m-%d")
                self._completed_sessions = {
                    s for s in self._completed_sessions if s.startswith(today_key)
                }
            else:
                wait = min(self._interval, _seconds_until_next_session())

            log.debug("Scheduler sleeping %.0fs", wait)
            self._stop.wait(min(wait, 3600))

    def _do_refresh(self) -> dict:
        from .fetcher import refresh_all, load_config, _current_session_label

        session_label = _current_session_label()
        today_key = _et_now().strftime("%Y-%m-%d")
        session_key = f"{today_key}_{session_label}"

        if session_key in self._completed_sessions:
            log.debug("Session %s already completed, skipping", session_key)
            return {"skipped": session_key}

        config = load_config(self._static_folder)
        db = self._inv_session_factory()
        try:
            result = refresh_all(db, config)
            self.last_refresh = datetime.now(timezone.utc)
            self.last_error = None
            self._completed_sessions.add(session_key)
            log.info("Investing refresh complete [%s]", session_label)
            return result
        except Exception as exc:
            self.last_error = str(exc)
            log.error("Investing refresh failed: %s", exc, exc_info=True)
            return {"error": str(exc)}
        finally:
            db.close()

    def update_interval(self, minutes: int):
        self._interval = minutes * 60
