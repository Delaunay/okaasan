"""Base library scanner with filesystem change detection and daily scheduling."""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .paths import private_folder
from .task_registry import registry

log = logging.getLogger("okaasan.scanner")

_SCAN_STATE_FILE = "_last_scans.json"
_MIN_SCAN_GAP_SECONDS = 3600  # skip startup scan if one happened within the last hour


class FolderFingerprint:
    """Quick filesystem fingerprint: file count + newest mtime in configured folders."""

    __slots__ = ("file_count", "newest_mtime")

    def __init__(self, file_count: int, newest_mtime: float):
        self.file_count = file_count
        self.newest_mtime = newest_mtime

    def __eq__(self, other):
        if not isinstance(other, FolderFingerprint):
            return NotImplemented
        return self.file_count == other.file_count and self.newest_mtime == other.newest_mtime

    def __repr__(self):
        return f"FolderFingerprint(files={self.file_count}, mtime={self.newest_mtime:.0f})"


def compute_fingerprint(folders: list[str], extensions: set[str] | None = None) -> FolderFingerprint:
    """Walk folders and compute a lightweight fingerprint without reading file contents."""
    file_count = 0
    newest_mtime = 0.0

    for folder in folders:
        folder_path = Path(folder)
        if not folder_path.is_dir():
            continue
        for root, _dirs, files in os.walk(folder_path):
            for fname in files:
                if extensions:
                    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                    if ext not in extensions:
                        continue
                file_count += 1
                try:
                    mtime = os.path.getmtime(os.path.join(root, fname))
                    if mtime > newest_mtime:
                        newest_mtime = mtime
                except OSError:
                    pass

    return FolderFingerprint(file_count, newest_mtime)


class BaseLibraryScanner:
    """Background scanner with change detection and configurable scheduling.

    Subclasses must implement:
        _get_folders(config) -> list[str]
        _get_extensions(config) -> set[str] | None
        _do_scan() -> dict
        _load_config() -> dict
        _log_name: str (for log messages)
    """

    _log_name: str = "library"

    def __init__(self, static_folder: str, private_engine, main_engine):
        self.static_folder = static_folder
        self.private_engine = private_engine
        self.main_engine = main_engine
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self.last_scan: datetime | None = None
        self.last_result: dict | None = None
        self._last_fingerprint: FolderFingerprint | None = None

    # ── Subclass interface ─────────────────────────────────────────────

    def _load_config(self) -> dict[str, Any]:
        raise NotImplementedError

    def _get_folders(self, config: dict) -> list[str]:
        """Return flat list of folder paths to scan."""
        raise NotImplementedError

    def _get_extensions(self, config: dict) -> set[str] | None:
        """Return set of file extensions to consider, or None for all."""
        return None

    def _do_scan(self) -> dict:
        """Execute the actual scan. Must be implemented by subclass."""
        raise NotImplementedError

    # ── Public API ─────────────────────────────────────────────────────

    def start(self):
        config = self._load_config()
        folders = self._get_folders(config)
        if not folders:
            log.info("No %s folders configured, skipping background scan", self._log_name)
            return
        registry.register(f"scanner:{self._log_name}", f"{self._log_name.title()} Scanner")
        self._thread = threading.Thread(target=self._run, daemon=True, name=f"{self._log_name}-scanner")
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def scan_now(self) -> dict:
        """Trigger an immediate scan (synchronous), bypassing change detection and recency check."""
        tid = f"scanner:{self._log_name}"
        registry.update(tid, status="running", detail="Scanning...")
        try:
            result = self._do_scan()
        except Exception:
            registry.update(tid, status="error", detail="Scan failed")
            raise
        self.last_scan = datetime.now(timezone.utc)
        self.last_result = result
        self._save_last_scan_time()
        config = self._load_config()
        folders = self._get_folders(config)
        extensions = self._get_extensions(config)
        if folders:
            self._last_fingerprint = compute_fingerprint(folders, extensions)
        registry.update(tid, status="idle", detail="")
        return result

    # ── Scan state persistence ──────────────────────────────────────────

    def _scan_state_path(self) -> Path:
        return private_folder() / _SCAN_STATE_FILE

    def _load_last_scan_time(self) -> datetime | None:
        """Load the last scan timestamp for this scanner from disk."""
        p = self._scan_state_path()
        if not p.is_file():
            return None
        try:
            with open(p) as f:
                data = json.load(f)
            ts = data.get(self._log_name)
            if ts:
                return datetime.fromisoformat(ts)
        except (ValueError, OSError, KeyError):
            pass
        return None

    def _save_last_scan_time(self):
        """Persist the current scan timestamp to disk."""
        p = self._scan_state_path()
        data: dict[str, str] = {}
        if p.is_file():
            try:
                with open(p) as f:
                    data = json.load(f)
            except (ValueError, OSError):
                data = {}
        data[self._log_name] = datetime.now(timezone.utc).isoformat()
        try:
            with open(p, "w") as f:
                json.dump(data, f, indent=2)
        except OSError as e:
            log.warning("Could not save scan state for %s: %s", self._log_name, e)

    def _was_scanned_recently(self) -> bool:
        """Return True if this scanner ran within _MIN_SCAN_GAP_SECONDS."""
        last = self._load_last_scan_time()
        if last is None:
            return False
        elapsed = (datetime.now(timezone.utc) - last).total_seconds()
        return elapsed < _MIN_SCAN_GAP_SECONDS

    # ── Internal scheduling ────────────────────────────────────────────

    def _has_changes(self, config: dict) -> bool:
        """Check if filesystem changed since last scan."""
        folders = self._get_folders(config)
        extensions = self._get_extensions(config)
        if not folders:
            return False

        current = compute_fingerprint(folders, extensions)

        if self._last_fingerprint is None:
            self._last_fingerprint = current
            return True

        if current != self._last_fingerprint:
            log.info(
                "%s: changes detected (files: %d→%d, mtime: %.0f→%.0f)",
                self._log_name,
                self._last_fingerprint.file_count, current.file_count,
                self._last_fingerprint.newest_mtime, current.newest_mtime,
            )
            self._last_fingerprint = current
            return True

        return False

    def _seconds_until_hour(self, hour: int, tz_name: str) -> float:
        """Compute seconds until the next occurrence of the given local hour."""
        try:
            local_tz = ZoneInfo(tz_name)
        except Exception:
            local_tz = ZoneInfo("UTC")

        now_local = datetime.now(local_tz)
        target = now_local.replace(hour=hour, minute=0, second=0, microsecond=0)
        if now_local >= target:
            target += timedelta(days=1)
        return (target - now_local).total_seconds()

    def _run(self):
        tid = f"scanner:{self._log_name}"
        if self._was_scanned_recently():
            log.info("%s: skipping startup scan (last scan was recent)", self._log_name)
        else:
            try:
                self.scan_now()
            except Exception as e:
                log.warning("Initial %s scan failed: %s", self._log_name, e)
                registry.update(tid, status="error", error=str(e))

        while not self._stop_event.is_set():
            config = self._load_config()
            scan_mode = config.get("scan_mode", "daily")
            scan_hour = config.get("scan_hour", 1)
            scan_tz = config.get("scan_timezone", "UTC")
            interval_minutes = config.get("scan_interval_minutes", 1440)

            if scan_mode == "daily":
                wait_secs = self._seconds_until_hour(scan_hour, scan_tz)
                log.debug("%s: next scan in %.0f seconds (at %02d:00 %s)", self._log_name, wait_secs, scan_hour, scan_tz)
            else:
                wait_secs = interval_minutes * 60

            registry.update(tid, status="idle", detail="Waiting for next scan")

            if self._stop_event.wait(timeout=wait_secs):
                break

            if not self._has_changes(config):
                log.debug("%s: no changes detected, skipping scan", self._log_name)
                continue

            try:
                self.scan_now()
            except Exception as e:
                log.warning("Periodic %s scan failed: %s", self._log_name, e)
                registry.update(tid, status="error", error=str(e))
