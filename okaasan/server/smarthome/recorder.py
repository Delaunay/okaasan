"""Background thread that periodically records sensor measurements to the database."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from . import mqtt_client
from .models import SensorReading, SensorConfig

log = logging.getLogger("okaasan.smarthome.recorder")

DEFAULT_INTERVAL = 60  # seconds


class SensorRecorder:
    def __init__(self, session_factory: sessionmaker, check_interval: float = 10.0):
        self._session_factory = session_factory
        self._check_interval = check_interval
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._last_recorded: dict[tuple[str, str], float] = {}
        self._config_cache: dict[tuple[str, str], tuple[int, bool]] = {}
        self._config_loaded_at: float = 0

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="sensor-recorder", daemon=True)
        self._thread.start()
        log.info("Sensor recorder started (check every %.0fs)", self._check_interval)

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        log.info("Sensor recorder stopped")

    def _load_config(self, session: Session) -> None:
        """Reload config cache from DB every 30s."""
        now = time.time()
        if now - self._config_loaded_at < 30:
            return
        configs = session.query(SensorConfig).all()
        self._config_cache = {
            (c.device_name, c.metric): (c.interval_seconds, bool(c.enabled))
            for c in configs
        }
        self._config_loaded_at = now

    def _get_interval(self, device_name: str, metric: str) -> tuple[int, bool]:
        """Return (interval_seconds, enabled) for a device/metric pair."""
        key = (device_name, metric)
        if key in self._config_cache:
            return self._config_cache[key]
        # Wildcard: config for all metrics of a device
        wildcard = (device_name, "*")
        if wildcard in self._config_cache:
            return self._config_cache[wildcard]
        return (DEFAULT_INTERVAL, True)

    def _run(self) -> None:
        time.sleep(5)  # let MQTT connect first
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as e:
                log.error("Recorder tick failed: %s", e, exc_info=True)
            self._stop_event.wait(self._check_interval)

    def _tick(self) -> None:
        states = mqtt_client.get_all_states()
        if not states:
            return

        # Get numeric metrics defined by each device's own exposes
        device_metrics = mqtt_client.get_all_numeric_metrics()

        now = time.time()
        readings_to_add: list[SensorReading] = []

        session = self._session_factory()
        try:
            self._load_config(session)

            for device_name, state in states.items():
                if not isinstance(state, dict):
                    continue

                allowed_metrics = device_metrics.get(device_name, {})

                for metric, value in state.items():
                    if metric not in allowed_metrics:
                        continue
                    if not isinstance(value, (int, float)):
                        continue

                    interval, enabled = self._get_interval(device_name, metric)
                    if not enabled:
                        continue

                    key = (device_name, metric)
                    last = self._last_recorded.get(key, 0)
                    if now - last < interval:
                        continue

                    readings_to_add.append(SensorReading(
                        device_name=device_name,
                        metric=metric,
                        value=float(value),
                        recorded_at=datetime.now(timezone.utc),
                    ))
                    self._last_recorded[key] = now

            if readings_to_add:
                session.add_all(readings_to_add)
                session.commit()
                log.debug("Recorded %d sensor readings", len(readings_to_add))
        finally:
            session.close()
