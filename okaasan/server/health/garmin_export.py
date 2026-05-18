"""Import health data from a Garmin account data export ZIP.

Garmin's data export contains:
- UDS (User Daily Summary) files with daily aggregates
- healthStatusData with daily HRV, HR, SPO2, respiration
- sleepData with sleep summaries
- FIT files (inside a nested ZIP) with raw activity recordings
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, date as date_type
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from .importer import import_metrics, import_activities, import_daily_summaries, ImportResult
from ..paths import private_folder

log = logging.getLogger("okaasan.health.garmin_export")

SOURCE = "garmin_export"


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _safe_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _parse_uds_files(extract_dir: Path) -> list[dict]:
    """Parse UDS (User Daily Summary) JSON files into HealthDailySummary dicts."""
    summaries: list[dict] = []
    agg_dir = extract_dir / "DI_CONNECT" / "DI-Connect-Aggregator"
    if not agg_dir.is_dir():
        return summaries

    for f in sorted(agg_dir.glob("UDSFile_*.json")):
        try:
            data = json.loads(f.read_text())
        except Exception as exc:
            log.warning("Failed to parse %s: %s", f.name, exc)
            continue

        for e in data if isinstance(data, list) else []:
            day = e.get("calendarDate")
            if not day:
                continue
            summaries.append({
                "day": day,
                "steps": _safe_int(e.get("totalSteps")),
                "steps_goal": _safe_int(e.get("dailyStepGoal")),
                "distance_m": _safe_float(e.get("totalDistanceMeters")),
                "calories_total": _safe_int(e.get("totalKilocalories")),
                "calories_active": _safe_int(e.get("activeKilocalories")),
                "calories_resting": _safe_int(e.get("bmrKilocalories")),
                "hr_resting": _safe_int(e.get("restingHeartRate") or e.get("currentDayRestingHeartRate")),
                "hr_min": _safe_int(e.get("minHeartRate")),
                "hr_max": _safe_int(e.get("maxHeartRate")),
                "spo2_avg": _safe_float(e.get("averageSpo2Value")),
                "spo2_min": _safe_int(e.get("lowestSpo2Value")),
                "intensity_moderate": _safe_int(e.get("moderateIntensityMinutes")),
                "intensity_vigorous": _safe_int(e.get("vigorousIntensityMinutes")),
            })

    return summaries


def _parse_health_status_files(extract_dir: Path) -> list[dict]:
    """Parse healthStatusData JSON files into HealthMetric dicts (daily HRV, HR, etc)."""
    metrics: list[dict] = []
    wellness_dir = extract_dir / "DI_CONNECT" / "DI-Connect-Wellness"
    if not wellness_dir.is_dir():
        return metrics

    type_map = {
        "HRV": ("hrv", "ms"),
        "HR": ("heart_rate", "bpm"),
        "SPO2": ("spo2", "%"),
        "RESPIRATION": ("respiration", "brpm"),
    }

    for f in sorted(wellness_dir.glob("*_healthStatusData.json")):
        try:
            data = json.loads(f.read_text())
        except Exception as exc:
            log.warning("Failed to parse %s: %s", f.name, exc)
            continue

        for e in data if isinstance(data, list) else []:
            day = e.get("calendarDate")
            if not day:
                continue
            ts = f"{day}T12:00:00"
            for m in e.get("metrics", []):
                mtype = m.get("type")
                value = m.get("value")
                if mtype in type_map and value is not None:
                    mt, unit = type_map[mtype]
                    metrics.append({
                        "metric_type": mt,
                        "timestamp": ts,
                        "value": float(value),
                        "unit": unit,
                    })

    return metrics


def _extract_fit_files(extract_dir: Path, dest_dir: Path) -> list[Path]:
    """Extract FIT files from nested ZIP inside the export."""
    fit_files: list[Path] = []
    uploaded_dir = extract_dir / "DI_CONNECT" / "DI-Connect-Uploaded-Files"
    if not uploaded_dir.is_dir():
        return fit_files

    dest_dir.mkdir(parents=True, exist_ok=True)

    for inner_zip_path in uploaded_dir.glob("UploadedFiles_*_Part*.zip"):
        try:
            with zipfile.ZipFile(inner_zip_path) as zf:
                for name in zf.namelist():
                    if not name.lower().endswith(".fit"):
                        continue
                    dest_path = dest_dir / Path(name).name
                    if dest_path.exists():
                        continue
                    with zf.open(name) as src, open(dest_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                    fit_files.append(dest_path)
        except Exception as exc:
            log.warning("Failed to extract FIT files from %s: %s", inner_zip_path.name, exc)

    return fit_files


def import_garmin_export(
    db: Session,
    zip_path: str | Path,
    *_args,
    on_progress=None,
) -> dict[str, Any]:
    """Import all data from a Garmin account data export ZIP.

    Returns a summary dict with counts for each data type imported.
    """
    zip_path = Path(zip_path)
    results: dict[str, Any] = {}

    def _emit(msg: str):
        if on_progress:
            on_progress(msg)
        log.info(msg)

    with tempfile.TemporaryDirectory() as tmpdir:
        extract_dir = Path(tmpdir)
        _emit("Extracting ZIP archive...")
        try:
            with zipfile.ZipFile(zip_path) as zf:
                zf.extractall(extract_dir)
        except Exception as exc:
            return {"error": f"Failed to extract ZIP: {exc}"}

        # 1. Import UDS daily summaries
        _emit("Parsing daily summaries (UDS)...")
        uds = _parse_uds_files(extract_dir)
        if uds:
            r = import_daily_summaries(db, SOURCE, uds)
            results["daily_summaries"] = {"inserted": r.inserted, "skipped": r.skipped, "errors": r.errors}
            _emit(f"Daily summaries: {r.inserted} new, {r.skipped} updated")
        else:
            results["daily_summaries"] = {"inserted": 0, "skipped": 0}

        # 2. Import healthStatusData metrics
        _emit("Parsing health status metrics (HRV, HR, SPO2, respiration)...")
        hs_metrics = _parse_health_status_files(extract_dir)
        if hs_metrics:
            r = import_metrics(db, SOURCE, hs_metrics)
            results["health_metrics"] = {"inserted": r.inserted, "skipped": r.skipped, "errors": r.errors}
            _emit(f"Health metrics: {r.inserted} new, {r.skipped} skipped")
        else:
            results["health_metrics"] = {"inserted": 0, "skipped": 0}

        # 3. Extract and import FIT files
        _emit("Extracting FIT files...")
        fit_dest = private_folder() / "fit_archive"
        fit_files = _extract_fit_files(extract_dir, fit_dest)
        _emit(f"Extracted {len(fit_files)} new FIT files")

        if fit_files:
            _emit("Importing FIT files...")
            fit_results: list[dict] = []
            try:
                from .fit_reader import import_fit_file
                error_sample: list[str] = []
                for i, fp in enumerate(fit_files):
                    try:
                        fit_results.append(import_fit_file(db, fp))
                    except Exception as exc:
                        fit_results.append({"file": fp.name, "error": str(exc)})
                        if len(error_sample) < 5:
                            error_sample.append(f"{fp.name}: {exc}")
                            log.warning("FIT import error: %s: %s", fp.name, exc)
                    if on_progress and (i + 1) % 100 == 0:
                        on_progress(f"FIT files: {i + 1}/{len(fit_files)} processed")
            except ImportError:
                _emit("FIT reader not available, skipping FIT import")
                fit_results = []

            inserted = sum(1 for r in fit_results if not r.get("error"))
            errors = sum(1 for r in fit_results if r.get("error"))
            results["fit_files"] = {"extracted": len(fit_files), "imported": inserted, "errors": errors}
            _emit(f"FIT files: {inserted} imported, {errors} errors")
        else:
            results["fit_files"] = {"extracted": 0, "imported": 0, "errors": 0}

    return results
