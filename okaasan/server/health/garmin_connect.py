"""Garmin Connect API connector.

Uses the ``garminconnect`` library to pull health metrics and activities
from the Garmin cloud, normalises them into our schema, and passes them
through the importer for dedup + storage.

Every raw API response is cached to disk via :mod:`garmin_cache` so that
syncs can be replayed without network access.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, date as date_type
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from .importer import import_metrics, import_activities, import_daily_summaries, ImportResult
from .garmin_cache import fetch_or_cache, load_cached
from ..paths import private_folder

log = logging.getLogger("okaasan.health.garmin")

SOURCE = "garmin_api"


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _token_path(config_dir: Path) -> Path:
    return private_folder() / "_garmin_tokens.json"


def _get_client(config_dir: Path):
    try:
        from garminconnect import Garmin
    except ImportError:
        raise RuntimeError("garminconnect is not installed. Run: pip install garminconnect")

    tp = _token_path(config_dir)
    if not tp.is_file():
        raise RuntimeError("No Garmin tokens found. Please authenticate first via the settings page.")

    client = Garmin()
    client.login(str(tp))
    return client


def garmin_login(config_dir: Path, email: str, password: str) -> dict:
    try:
        from garminconnect import Garmin
    except ImportError:
        raise RuntimeError("garminconnect is not installed")

    tp = _token_path(config_dir)
    tp.parent.mkdir(parents=True, exist_ok=True)
    client = Garmin(email, password)
    client.login(str(tp))
    return {"status": "ok", "display_name": getattr(client, "display_name", "")}


# ---------------------------------------------------------------------------
# Timestamp helpers
# ---------------------------------------------------------------------------

_SLEEP_STAGE_MAP = {0: "Deep", 1: "Light", 2: "REM", 3: "Awake"}


def _ts_to_iso(val) -> str | None:
    if isinstance(val, (int, float)):
        return datetime.fromtimestamp(val / 1000, tz=timezone.utc).isoformat()
    if isinstance(val, str):
        return val
    return None


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# Fetch + normalize: each function calls API (or cache), then returns
# normalized dicts ready for the importer.
# ---------------------------------------------------------------------------

def fetch_heart_rate(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_heart_rates", day,
                          lambda: client.get_heart_rates(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    metrics: list[dict] = []
    for entry in (data or {}).get("heartRateValues", []):
        ts_ms, value = entry
        if value is None:
            continue
        metrics.append({
            "metric_type": "heart_rate",
            "timestamp": datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat(),
            "value": value,
            "unit": "bpm",
        })
    return metrics


def fetch_hrv(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_hrv_data", day,
                          lambda: client.get_hrv_data(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    metrics: list[dict] = []

    for entry in (data or {}).get("hrvReadings", []):
        ts = entry.get("readingTimeGMT")
        value = entry.get("hrvValue")
        if ts and value is not None:
            metrics.append({"metric_type": "hrv", "timestamp": ts, "value": value, "unit": "ms"})

    if not metrics:
        summary = (data or {}).get("hrvSummary", {})
        ts = summary.get("calendarDate") or day.isoformat()
        value = summary.get("lastNightAvg") or summary.get("weeklyAvg")
        if value:
            metrics.append({"metric_type": "hrv", "timestamp": ts, "value": value, "unit": "ms"})

    return metrics


def fetch_spo2(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_spo2_data", day,
                          lambda: client.get_spo2_data(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    metrics: list[dict] = []

    for entry in (data or {}).get("spO2HourlyAverages", []):
        if isinstance(entry, list) and len(entry) >= 2:
            ts_ms, value = entry[0], entry[1]
            if value is not None and isinstance(ts_ms, (int, float)):
                ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()
                metrics.append({"metric_type": "spo2", "timestamp": ts, "value": value, "unit": "%"})

    if not metrics:
        for entry in (data or {}).get("spO2SingleReadings", (data or {}).get("spo2Readings", [])) or []:
            if isinstance(entry, dict):
                ts = entry.get("readingTimeGMT") or entry.get("startGMT")
                value = entry.get("spo2") or entry.get("spo2Value")
                if ts and value:
                    metrics.append({"metric_type": "spo2", "timestamp": ts, "value": value, "unit": "%"})

    return metrics


def fetch_vo2max(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_max_metrics", day,
                          lambda: client.get_max_metrics(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    metrics: list[dict] = []
    entries = (data or {}).get("maxMetricsSummaries", [data] if isinstance(data, dict) else [])
    for entry in entries:
        vo2 = entry.get("vo2MaxPreciseValue") or entry.get("vo2MaxValue")
        ts = entry.get("calendarDate") or day.isoformat()
        if vo2:
            metrics.append({"metric_type": "vo2max", "timestamp": ts, "value": vo2, "unit": "mL/kg/min"})
    return metrics


def fetch_stress(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_stress_data", day,
                          lambda: client.get_stress_data(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    metrics: list[dict] = []
    for entry in (data or {}).get("stressValuesArray", (data or {}).get("stressValues", [])):
        if isinstance(entry, list) and len(entry) >= 2:
            ts_ms, value = entry[0], entry[1]
        elif isinstance(entry, dict):
            ts_ms = entry.get("timestampGMT") or entry.get("timestamp")
            value = entry.get("stressLevel") or entry.get("value")
        else:
            continue
        if value is not None and value >= 0:
            ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat() if isinstance(ts_ms, (int, float)) else ts_ms
            metrics.append({"metric_type": "stress", "timestamp": ts, "value": value, "unit": ""})
    return metrics


def fetch_body_battery(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_body_battery", day,
                          lambda: client.get_body_battery(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    values_array: list = []
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                values_array.extend(item.get("bodyBatteryValuesArray", []))
            else:
                values_array.append(item)
    elif isinstance(data, dict):
        values_array = data.get("bodyBatteryValuesArray", [])

    metrics: list[dict] = []
    for entry in values_array:
        if isinstance(entry, list) and len(entry) >= 2:
            ts_ms, value = entry[0], entry[1]
        elif isinstance(entry, dict):
            ts_ms = entry.get("timestampGMT") or entry.get("timestamp")
            value = entry.get("bodyBatteryLevel") or entry.get("value")
        else:
            continue
        if value is not None and isinstance(ts_ms, (int, float)):
            ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()
            metrics.append({"metric_type": "body_battery", "timestamp": ts, "value": value, "unit": ""})
    return metrics


def fetch_respiration(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_respiration_data", day,
                          lambda: client.get_respiration_data(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    metrics: list[dict] = []
    for entry in (data or {}).get("respirationValuesArray", (data or {}).get("respirationValues", [])):
        if isinstance(entry, list) and len(entry) >= 2:
            ts_ms, value = entry[0], entry[1]
        elif isinstance(entry, dict):
            ts_ms = entry.get("timestampGMT") or entry.get("timestamp")
            value = entry.get("respirationValue") or entry.get("value")
        else:
            continue
        if value is not None and value > 0 and isinstance(ts_ms, (int, float)):
            ts = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).isoformat()
            metrics.append({"metric_type": "respiration", "timestamp": ts, "value": value, "unit": "brpm"})
    return metrics


def fetch_steps(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_steps_data", day,
                          lambda: client.get_steps_data(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    metrics: list[dict] = []
    entries = data if isinstance(data, list) else (data or {}).get("stepsValuesArray", [])
    for entry in entries:
        if isinstance(entry, dict):
            ts = entry.get("startGMT") or entry.get("timestamp")
            value = entry.get("steps") or entry.get("value")
            if ts and value and value > 0:
                metrics.append({"metric_type": "steps", "timestamp": ts, "value": value, "unit": "steps"})
    return metrics


def fetch_sleep(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    """Fetch sleep data including granular sleepLevels for stage timing."""
    data = fetch_or_cache(config_dir, "get_sleep_data", day,
                          lambda: client.get_sleep_data(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    daily = data.get("dailySleepDTO", data)
    start = daily.get("sleepStartTimestampGMT") or daily.get("sleepStartTimestamp")
    end = daily.get("sleepEndTimestampGMT") or daily.get("sleepEndTimestamp")
    duration = daily.get("sleepTimeSeconds")

    if not start:
        return []

    start = _ts_to_iso(start)
    end = _ts_to_iso(end)

    sleep_levels: list[dict] = []
    raw_levels = data.get("sleepLevels") or daily.get("sleepLevels") or []
    for lvl in raw_levels:
        s = _ts_to_iso(lvl.get("startGMT"))
        e = _ts_to_iso(lvl.get("endGMT"))
        stage_num = lvl.get("activityLevel")
        if s and e and stage_num is not None:
            sleep_levels.append({
                "start": s, "end": e,
                "stage": _SLEEP_STAGE_MAP.get(int(stage_num), f"unknown_{stage_num}"),
            })

    tz_offset_sec = None
    gmt_ms = daily.get("sleepStartTimestampGMT")
    local_ms = daily.get("sleepStartTimestampLocal")
    if isinstance(gmt_ms, (int, float)) and isinstance(local_ms, (int, float)):
        tz_offset_sec = int((local_ms - gmt_ms) / 1000)

    scores = daily.get("sleepScores", {}) if isinstance(daily.get("sleepScores"), dict) else {}

    return [{
        "source_id": f"garmin_sleep_{day.isoformat()}",
        "activity_type": "sleep",
        "start_time": start,
        "end_time": end,
        "duration_seconds": duration,
        "summary": {
            "deep_seconds": daily.get("deepSleepSeconds"),
            "light_seconds": daily.get("lightSleepSeconds"),
            "rem_seconds": daily.get("remSleepSeconds"),
            "awake_seconds": daily.get("awakeSleepSeconds"),
            "score": scores.get("overall", {}).get("value") if scores else None,
            "avg_spo2": daily.get("averageSpO2Value"),
            "avg_hr": daily.get("averageSpO2HRSleep"),
            "avg_respiration": daily.get("averageRespirationValue"),
            "avg_stress": daily.get("avgSleepStress"),
        },
        "extension": {
            "sleep_levels": sleep_levels,
            **({"tz_offset_sec": tz_offset_sec} if tz_offset_sec is not None else {}),
        } if sleep_levels else None,
    }]


def fetch_activities(client, start: date_type, end: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    data = fetch_or_cache(config_dir, "get_activities_by_date", start,
                          lambda: client.get_activities_by_date(start.isoformat(), end.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    activities: list[dict] = []
    for act in data or []:
        aid = act.get("activityId")
        activities.append({
            "source_id": f"garmin_{aid}" if aid else None,
            "activity_type": (act.get("activityType", {}).get("typeKey") or "unknown").lower(),
            "start_time": act.get("startTimeGMT"),
            "duration_seconds": act.get("duration"),
            "distance_m": act.get("distance"),
            "calories": act.get("calories"),
            "avg_hr": act.get("averageHR"),
            "max_hr": act.get("maxHR"),
            "summary": {
                "elevation_gain": act.get("elevationGain"),
                "avg_speed": act.get("averageSpeed"),
                "steps": act.get("steps"),
            },
        })
    return activities


def fetch_daily_summary(client, day: date_type, config_dir: Path, *, replay: bool = False) -> list[dict]:
    """Fetch daily stats and return a dict ready for HealthDailySummary."""
    data = fetch_or_cache(config_dir, "get_stats", day,
                          lambda: client.get_stats(day.isoformat()) if client else None,
                          replay=replay)
    if not data:
        return []

    d = data
    summary: dict[str, Any] = {"day": day.isoformat()}

    summary["steps"] = _safe_int(d.get("totalSteps"))
    summary["steps_goal"] = _safe_int(d.get("dailyStepGoal"))
    summary["distance_m"] = _safe_float(d.get("totalDistanceMeters"))
    summary["floors_ascended"] = _safe_int(d.get("floorsAscended"))
    summary["floors_descended"] = _safe_int(d.get("floorsDescended"))
    summary["calories_total"] = _safe_int(d.get("totalKilocalories"))
    summary["calories_active"] = _safe_int(d.get("activeKilocalories"))
    summary["calories_resting"] = _safe_int(d.get("bmrKilocalories"))
    summary["hr_min"] = _safe_int(d.get("minHeartRate"))
    summary["hr_max"] = _safe_int(d.get("maxHeartRate"))
    summary["hr_resting"] = _safe_int(d.get("restingHeartRate"))
    summary["stress_avg"] = _safe_int(d.get("averageStressLevel"))
    summary["stress_max"] = _safe_int(d.get("maxStressLevel"))
    summary["bb_max"] = _safe_int(d.get("bodyBatteryHighestValue"))
    summary["bb_min"] = _safe_int(d.get("bodyBatteryLowestValue"))
    summary["bb_charged"] = _safe_int(d.get("bodyBatteryChargedValue"))
    summary["bb_drained"] = _safe_int(d.get("bodyBatteryDrainedValue"))
    summary["bb_latest"] = _safe_int(d.get("bodyBatteryMostRecentValue"))
    summary["rr_avg"] = _safe_float(d.get("averageSpo2")) if d.get("averageSpo2") else None
    summary["intensity_moderate"] = _safe_int(d.get("moderateIntensityMinutes"))
    summary["intensity_vigorous"] = _safe_int(d.get("vigorousIntensityMinutes"))
    summary["intensity_goal"] = _safe_int(d.get("intensityMinutesGoal"))
    summary["weight"] = _safe_float(d.get("weight"))
    summary["spo2_avg"] = _safe_float(d.get("averageSpo2"))
    summary["spo2_min"] = _safe_float(d.get("lowestSpo2"))
    summary["sleep_seconds"] = _safe_int(d.get("sleepingSeconds"))

    summary["rr_avg"] = _safe_float(d.get("averageRespirationValue"))
    summary["rr_min"] = _safe_float(d.get("lowestRespirationValue"))
    summary["rr_max"] = _safe_float(d.get("highestRespirationValue"))

    # Sleep score comes from the sleep API, not stats
    sleep_data = load_cached(config_dir, "get_sleep_data", day)
    if sleep_data:
        sleep_daily = sleep_data.get("dailySleepDTO", sleep_data)
        scores = sleep_daily.get("sleepScores", {}) if isinstance(sleep_daily.get("sleepScores"), dict) else {}
        summary["sleep_score"] = _safe_int(scores.get("overall", {}).get("value"))

    return [summary]


# ---------------------------------------------------------------------------
# High-level sync
# ---------------------------------------------------------------------------

_METRIC_FETCHERS = [
    fetch_heart_rate, fetch_hrv, fetch_spo2, fetch_vo2max,
    fetch_stress, fetch_body_battery, fetch_respiration, fetch_steps,
]


def sync_day(
    db: Session,
    config_dir: Path,
    day: date_type,
    *,
    client=None,
    replay: bool = False,
) -> dict[str, Any]:
    """Sync all health data for a single day.

    If *client* is None and replay is False, a new client is created
    (slower). Prefer passing a pre-authenticated client.
    """
    if client is None and not replay:
        client = _get_client(config_dir)

    results: dict[str, Any] = {}

    all_metrics: list[dict] = []
    for fetcher in _METRIC_FETCHERS:
        try:
            all_metrics.extend(fetcher(client, day, config_dir, replay=replay))
        except Exception as exc:
            log.warning("Fetcher %s failed for %s: %s", fetcher.__name__, day, exc)

    if all_metrics:
        r = import_metrics(db, SOURCE, all_metrics)
        results["metrics"] = {"inserted": r.inserted, "skipped": r.skipped, "errors": r.errors}

    all_activities: list[dict] = []
    try:
        all_activities.extend(fetch_sleep(client, day, config_dir, replay=replay))
    except Exception as exc:
        log.warning("fetch_sleep failed for %s: %s", day, exc)
    try:
        all_activities.extend(fetch_activities(client, day, day, config_dir, replay=replay))
    except Exception as exc:
        log.warning("fetch_activities failed for %s: %s", day, exc)

    if all_activities:
        r = import_activities(db, SOURCE, all_activities)
        results["activities"] = {"inserted": r.inserted, "skipped": r.skipped, "errors": r.errors}

    try:
        daily = fetch_daily_summary(client, day, config_dir, replay=replay)
        if daily:
            r = import_daily_summaries(db, SOURCE, daily)
            results["daily_summary"] = {"inserted": r.inserted, "skipped": r.skipped, "errors": r.errors}
    except Exception as exc:
        log.warning("fetch_daily_summary failed for %s: %s", day, exc)

    return results
