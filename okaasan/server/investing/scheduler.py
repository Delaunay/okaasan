"""Background scheduler for periodic investing data refresh."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone

from sqlalchemy.orm import sessionmaker

log = logging.getLogger("okaasan.investing.scheduler")


class InvestingScheduler:
    """Periodically refreshes stock prices and option chains."""

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
        self._interval = interval_minutes * 60
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self.last_refresh: datetime | None = None
        self.last_error: str | None = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._loop, name="investing-scheduler", daemon=True,
        )
        self._thread.start()
        log.info("Investing scheduler started (interval=%ds)", self._interval)

    def stop(self):
        self._stop.set()

    def refresh_now(self) -> dict:
        return self._do_refresh()

    def _loop(self):
        # Initial delay to let the server finish starting
        self._stop.wait(30)

        while not self._stop.is_set():
            self._do_refresh()
            self._stop.wait(self._interval)

    def _do_refresh(self) -> dict:
        from .fetcher import refresh_all, load_config

        config = load_config(self._static_folder)
        db = self._inv_session_factory()
        try:
            result = refresh_all(db, config)
            self.last_refresh = datetime.now(timezone.utc)
            self.last_error = None
            log.info("Investing refresh complete")
            return result
        except Exception as exc:
            self.last_error = str(exc)
            log.error("Investing refresh failed: %s", exc, exc_info=True)
            return {"error": str(exc)}
        finally:
            db.close()

    def update_interval(self, minutes: int):
        self._interval = minutes * 60
