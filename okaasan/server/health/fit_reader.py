"""FIT file parser connector.

Copies .fit files into a local archive (``private/fit/``),
parses them with ``fitparse``, and imports the extracted metrics and
activities via the dedup importer.
"""

from __future__ import annotations

import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from .importer import import_metrics, import_activities, ImportResult
from ..paths import private_folder

_SPORT_NORMALIZE: dict[str, str] = {
    "64": "badminton",
    "swimming": "lap_swimming",
    "training": "yoga",
    "generic": "other",
}

log = logging.getLogger("okaasan.health.fit")

SOURCE = "fit_file"


def _fit_archive_dir(upload_folder: str | Path) -> Path:
    d = private_folder() / "fit"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---------------------------------------------------------------------------
# Copy helpers
# ---------------------------------------------------------------------------

def copy_fit_files(source_dir: str | Path, upload_folder: str | Path) -> list[Path]:
    """Copy .fit files from *source_dir* into the local archive.

    Skips files whose name already exists in the archive.
    Returns paths of newly copied files.
    """
    archive = _fit_archive_dir(upload_folder)
    source = Path(source_dir)
    if not source.is_dir():
        log.warning("FIT source directory does not exist: %s", source)
        return []

    new_files: list[Path] = []
    for f in source.rglob("*.fit"):
        dest = archive / f.name
        if dest.exists():
            continue
        shutil.copy2(f, dest)
        new_files.append(dest)
        log.info("Copied FIT file %s -> %s", f, dest)

    return new_files


def save_uploaded_fit(file_bytes: bytes, filename: str, upload_folder: str | Path) -> Path:
    """Save an uploaded FIT file into the local archive."""
    archive = _fit_archive_dir(upload_folder)
    dest = archive / filename
    dest.write_bytes(file_bytes)
    return dest


# ---------------------------------------------------------------------------
# Parse
# ---------------------------------------------------------------------------

def parse_fit_file(path: str | Path) -> dict[str, Any]:
    """Parse a single .fit file and return extracted data.

    Returns ``{"metrics": [...], "activities": [...]}``.
    """
    try:
        from fitparse import FitFile
    except ImportError:
        raise RuntimeError("fitparse is not installed. Run: pip install fitparse")

    fit = FitFile(str(path))
    try:
        fit.parse()
    except Exception:
        log.debug("FIT parse() failed for %s, trying message-level parse", Path(path).name)

    filename = Path(path).name
    metrics: list[dict] = []
    activities: list[dict] = []

    session_data: dict[str, Any] = {}

    for message in fit.get_messages():
        try:
            msg_type = message.name
        except Exception:
            continue

        if msg_type == "record":
            try:
                fields = {f.name: f.value for f in message.fields if isinstance(f.name, str)}
            except Exception:
                continue
            ts = fields.get("timestamp")
            if not isinstance(ts, datetime):
                continue

            ts_iso = ts.replace(tzinfo=timezone.utc).isoformat() if ts.tzinfo is None else ts.isoformat()

            if fields.get("heart_rate") is not None:
                metrics.append({
                    "metric_type": "heart_rate",
                    "timestamp": ts_iso,
                    "value": fields["heart_rate"],
                    "unit": "bpm",
                    "device": filename,
                })

            if fields.get("SpO2") is not None or fields.get("saturated_hemoglobin_percent") is not None:
                val = fields.get("SpO2") or fields.get("saturated_hemoglobin_percent")
                if val and val > 0:
                    metrics.append({
                        "metric_type": "spo2",
                        "timestamp": ts_iso,
                        "value": val,
                        "unit": "%",
                        "device": filename,
                    })

        elif msg_type == "hrv":
            try:
                fields = {f.name: f.value for f in message.fields if isinstance(f.name, str)}
            except Exception:
                continue
            ts = fields.get("timestamp")
            hrv_val = fields.get("value")
            if isinstance(hrv_val, (list, tuple)):
                for v in hrv_val:
                    if v is not None and v > 0:
                        ts_iso = ts.replace(tzinfo=timezone.utc).isoformat() if ts and ts.tzinfo is None else (ts.isoformat() if ts else None)
                        if ts_iso:
                            metrics.append({
                                "metric_type": "hrv",
                                "timestamp": ts_iso,
                                "value": v * 1000,  # s -> ms
                                "unit": "ms",
                                "device": filename,
                            })
            elif hrv_val is not None and hrv_val > 0 and ts:
                ts_iso = ts.replace(tzinfo=timezone.utc).isoformat() if ts.tzinfo is None else ts.isoformat()
                metrics.append({
                    "metric_type": "hrv",
                    "timestamp": ts_iso,
                    "value": hrv_val * 1000,
                    "unit": "ms",
                    "device": filename,
                })

        elif msg_type == "session":
            try:
                fields = {f.name: f.value for f in message.fields if isinstance(f.name, str)}
            except Exception:
                continue
            raw_sport = fields.get("sport")
            sport = str(raw_sport).lower() if raw_sport is not None else "unknown"
            sport = _SPORT_NORMALIZE.get(sport, sport)
            start = fields.get("start_time") or fields.get("timestamp")
            if isinstance(start, datetime):
                start_iso = start.replace(tzinfo=timezone.utc).isoformat() if start.tzinfo is None else start.isoformat()
            else:
                start_iso = None

            total_time = fields.get("total_timer_time") or fields.get("total_elapsed_time")
            end_ts = None
            if start and total_time:
                from datetime import timedelta
                end = start + timedelta(seconds=total_time)
                end_ts = end.replace(tzinfo=timezone.utc).isoformat() if end.tzinfo is None else end.isoformat()

            session_data = {
                "source_id": f"fit_{filename}",
                "activity_type": sport,
                "start_time": start_iso,
                "end_time": end_ts,
                "duration_seconds": int(total_time) if total_time else None,
                "distance_m": fields.get("total_distance"),
                "calories": fields.get("total_calories"),
                "avg_hr": fields.get("avg_heart_rate"),
                "max_hr": fields.get("max_heart_rate"),
                "summary": {
                    "total_ascent": fields.get("total_ascent"),
                    "total_descent": fields.get("total_descent"),
                    "avg_speed": fields.get("avg_speed") or fields.get("enhanced_avg_speed"),
                    "max_speed": fields.get("max_speed") or fields.get("enhanced_max_speed"),
                },
            }

    if session_data and session_data.get("start_time"):
        activities.append(session_data)

    return {"metrics": metrics, "activities": activities}


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------

def import_fit_file(db: Session, file_path: str | Path) -> dict[str, Any]:
    """Parse and import a single FIT file."""
    data = parse_fit_file(file_path)
    results: dict[str, Any] = {}

    if data["metrics"]:
        r = import_metrics(db, SOURCE, data["metrics"])
        results["metrics"] = {"inserted": r.inserted, "skipped": r.skipped, "errors": r.errors}

    if data["activities"]:
        r = import_activities(db, SOURCE, data["activities"])
        results["activities"] = {"inserted": r.inserted, "skipped": r.skipped, "errors": r.errors}

    results["file"] = Path(file_path).name
    return results


def import_all_local(db: Session, upload_folder: str | Path) -> list[dict]:
    """Import all FIT files from the local archive."""
    archive = _fit_archive_dir(upload_folder)
    results: list[dict] = []

    for f in sorted(archive.glob("*.fit")):
        try:
            r = import_fit_file(db, f)
            results.append(r)
        except Exception as exc:
            log.error("Error importing %s: %s", f.name, exc)
            results.append({"file": f.name, "error": str(exc)})

    return results
