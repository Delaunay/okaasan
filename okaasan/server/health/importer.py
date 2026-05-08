"""Batch import helpers with deduplication for health data."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy import and_

from .models import HealthMetric, HealthActivity, HealthDailySummary

log = logging.getLogger("okaasan.health.importer")


@dataclass
class ImportResult:
    inserted: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


def _parse_ts(raw: Any) -> datetime | None:
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=None) if raw.tzinfo else raw
    if isinstance(raw, str):
        try:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            return dt.replace(tzinfo=None) if dt.tzinfo else dt
        except ValueError:
            return None
    return None


def import_metrics(
    db: Session,
    source: str,
    metrics: list[dict],
    *,
    batch_size: int = 500,
) -> ImportResult:
    result = ImportResult()

    for i in range(0, len(metrics), batch_size):
        batch = metrics[i : i + batch_size]

        # Build set of existing keys for the batch
        timestamps = [_parse_ts(m.get("timestamp")) for m in batch]
        types = [m.get("metric_type") for m in batch]

        existing = set()
        if timestamps and types:
            rows = (
                db.query(HealthMetric.metric_type, HealthMetric.timestamp)
                .filter(
                    HealthMetric.source == source,
                    HealthMetric.metric_type.in_(set(types)),
                    HealthMetric.timestamp.in_([t for t in timestamps if t]),
                )
                .all()
            )
            existing = {(r.metric_type, r.timestamp) for r in rows}

        for m in batch:
            ts = _parse_ts(m.get("timestamp"))
            mt = m.get("metric_type")
            if not ts or not mt:
                result.errors.append(f"Missing timestamp or metric_type: {m}")
                continue

            if (mt, ts) in existing:
                result.skipped += 1
                continue

            try:
                db.add(HealthMetric(
                    source=source,
                    metric_type=mt,
                    timestamp=ts,
                    value=float(m.get("value", 0)),
                    unit=m.get("unit", ""),
                    device=m.get("device"),
                    extension=m.get("extension"),
                ))
                existing.add((mt, ts))
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"Error inserting metric {mt}@{ts}: {exc}")

        try:
            db.flush()
        except Exception as exc:
            db.rollback()
            result.inserted = max(0, result.inserted - len(batch))
            result.errors.append(f"Batch flush failed (rolled back): {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        result.errors.append(f"Commit error: {exc}")

    log.info(
        "import_metrics source=%s inserted=%d skipped=%d errors=%d",
        source, result.inserted, result.skipped, len(result.errors),
    )
    return result


def import_activities(
    db: Session,
    source: str,
    activities: list[dict],
) -> ImportResult:
    result = ImportResult()

    source_ids = [a.get("source_id") for a in activities if a.get("source_id")]
    existing_map: dict[str, HealthActivity] = {}
    if source_ids:
        rows = (
            db.query(HealthActivity)
            .filter(
                HealthActivity.source == source,
                HealthActivity.source_id.in_(source_ids),
            )
            .all()
        )
        existing_map = {r.source_id: r for r in rows}

    for a in activities:
        sid = a.get("source_id")
        if sid and sid in existing_map:
            existing_row = existing_map[sid]
            updated = False
            new_ext = a.get("extension")
            if new_ext and new_ext != existing_row.extension:
                existing_row.extension = new_ext
                updated = True
            new_smry = a.get("summary")
            if new_smry and new_smry != existing_row.summary:
                existing_row.summary = new_smry
                updated = True
            if updated:
                result.inserted += 1
            else:
                result.skipped += 1
            continue

        start = _parse_ts(a.get("start_time"))
        if not start:
            result.errors.append(f"Missing start_time: {a}")
            continue

            try:
                db.add(HealthActivity(
                    source=source,
                    source_id=sid,
                    activity_type=a.get("activity_type", "unknown"),
                    start_time=start,
                    end_time=_parse_ts(a.get("end_time")),
                    duration_seconds=a.get("duration_seconds"),
                    distance_m=a.get("distance_m"),
                    calories=a.get("calories"),
                    avg_hr=a.get("avg_hr"),
                    max_hr=a.get("max_hr"),
                    min_hr=a.get("min_hr"),
                    summary=a.get("summary"),
                    extension=a.get("extension"),
                ))
                if sid:
                    existing_map[sid] = True  # type: ignore[assignment]
                result.inserted += 1
            except Exception as exc:
                result.errors.append(f"Error inserting activity {sid}: {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        result.errors.append(f"Commit error: {exc}")

    log.info(
        "import_activities source=%s inserted=%d skipped=%d errors=%d",
        source, result.inserted, result.skipped, len(result.errors),
    )
    return result


def _parse_date(raw: Any):
    """Parse a date value (date object or ISO string) to datetime.date."""
    from datetime import date as date_cls
    if isinstance(raw, date_cls):
        return raw
    if isinstance(raw, str):
        try:
            return date_cls.fromisoformat(raw[:10])
        except ValueError:
            return None
    return None


_DAILY_FIELDS = [
    "steps", "steps_goal", "distance_m", "floors_ascended", "floors_descended",
    "calories_total", "calories_active", "calories_resting",
    "hr_min", "hr_max", "hr_resting",
    "stress_avg", "stress_max",
    "bb_min", "bb_max", "bb_charged", "bb_drained", "bb_latest",
    "rr_avg", "rr_min", "rr_max",
    "intensity_moderate", "intensity_vigorous", "intensity_goal",
    "weight", "hydration_ml",
    "spo2_avg", "spo2_min",
    "sleep_seconds", "sleep_score",
    "extension",
]


def import_daily_summaries(
    db: Session,
    source: str,
    summaries: list[dict],
) -> ImportResult:
    """Import daily summary rows with upsert semantics (update if exists)."""
    result = ImportResult()

    for s in summaries:
        day = _parse_date(s.get("day"))
        if not day:
            result.errors.append(f"Missing day: {s}")
            continue

        existing = (
            db.query(HealthDailySummary)
            .filter(HealthDailySummary.source == source, HealthDailySummary.day == day)
            .first()
        )

        try:
            if existing:
                for f in _DAILY_FIELDS:
                    v = s.get(f)
                    if v is not None:
                        setattr(existing, f, v)
                result.skipped += 1
            else:
                row = HealthDailySummary(source=source, day=day)
                for f in _DAILY_FIELDS:
                    v = s.get(f)
                    if v is not None:
                        setattr(row, f, v)
                db.add(row)
                result.inserted += 1
        except Exception as exc:
            result.errors.append(f"Error upserting daily summary {day}: {exc}")

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        result.errors.append(f"Commit error: {exc}")

    log.info(
        "import_daily_summaries source=%s inserted=%d updated=%d errors=%d",
        source, result.inserted, result.skipped, len(result.errors),
    )
    return result
