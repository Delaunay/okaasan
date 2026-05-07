"""Query helpers for feed and report aggregation.

All functions take a plain SQLAlchemy ``Session`` -- no FastAPI dependency.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from .model import AuditLog

log = logging.getLogger(__name__)


def get_feed(
    db: Session,
    *,
    limit: int = 20,
    offset: int = 0,
    entity_types: list[str] | None = None,
    actions: list[str] | None = None,
    created_by: str | None = None,
    owner: str | None = None,
) -> list[dict]:
    query = db.query(AuditLog).order_by(AuditLog.timestamp.desc())

    if entity_types:
        query = query.filter(AuditLog.entity_type.in_(entity_types))
    if actions:
        query = query.filter(AuditLog.action.in_(actions))
    if created_by:
        query = query.filter(AuditLog.created_by == created_by)
    if owner:
        query = query.filter(AuditLog.owner == owner)

    rows = query.offset(offset).limit(limit).all()
    return [row.to_json() for row in rows]


def _period_boundaries(
    period: Literal["week", "month", "year"],
    ref_date: date,
) -> tuple[datetime, datetime]:
    if period == "week":
        start = ref_date - timedelta(days=ref_date.weekday())
        end = start + timedelta(days=7)
    elif period == "month":
        start = ref_date.replace(day=1)
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    else:
        start = ref_date.replace(month=1, day=1)
        end = start.replace(year=start.year + 1)

    return (
        datetime(start.year, start.month, start.day, tzinfo=timezone.utc),
        datetime(end.year, end.month, end.day, tzinfo=timezone.utc),
    )


def get_report(
    db: Session,
    *,
    period: Literal["week", "month", "year"] = "week",
    ref_date: date | None = None,
    entity_types: list[str] | None = None,
) -> dict:
    if ref_date is None:
        ref_date = date.today()

    start_dt, end_dt = _period_boundaries(period, ref_date)

    query = (
        db.query(AuditLog)
        .filter(AuditLog.timestamp >= start_dt, AuditLog.timestamp < end_dt)
        .order_by(AuditLog.timestamp.desc())
    )
    if entity_types:
        query = query.filter(AuditLog.entity_type.in_(entity_types))

    rows = query.all()

    sections: dict[str, dict] = defaultdict(lambda: {
        "items": [],
        "created": 0,
        "updated": 0,
        "deleted": 0,
    })

    for row in rows:
        section = sections[row.entity_type]
        section["items"].append(row.to_json())
        if row.action in ("created", "updated", "deleted"):
            section[row.action] += 1

    return {
        "period": period,
        "start": start_dt.date().isoformat(),
        "end": end_dt.date().isoformat(),
        "sections": dict(sections),
        "total_changes": len(rows),
    }


def get_entity_history(
    db: Session,
    entity_type: str,
    entity_id: int,
) -> list[dict]:
    rows = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id)
        .order_by(AuditLog.timestamp.desc())
        .all()
    )
    return [row.to_json() for row in rows]


def _snapshot_entity(entity) -> dict:
    """Build a column-value dict from an ORM instance."""
    mapper = sa_inspect(entity.__class__)
    result = {}
    for col in mapper.columns:
        val = getattr(entity, col.key, None)
        if isinstance(val, datetime):
            val = val.isoformat()
        result[col.key] = val
    return result


def _extra_from_entity(entity) -> dict | None:
    extra = {}
    for field in ("tags", "article_kind", "tag", "kind"):
        val = getattr(entity, field, None)
        if val is not None:
            extra[field] = val
    return extra or None


def backfill(db: Session, models: list[type] | None = None) -> int:
    """Create ``action='created'`` audit entries for all existing entities
    that don't yet have an audit trail.

    Returns the number of entries created.
    """
    if models is None:
        from ..recipe.models import Recipe
        from ..articles.models import Article
        from ..tasks.models import Task
        from ..calendar.models import Event
        from ..product.models import Product
        models = [Recipe, Article, Task, Event, Product]

    existing = set()
    for row in db.query(AuditLog.entity_type, AuditLog.entity_id).all():
        existing.add((row[0], row[1]))

    count = 0
    for model_cls in models:
        entity_type = getattr(model_cls, "__audit_entity_type__", model_cls.__name__.lower())
        title_field = getattr(model_cls, "__audit_title_field__", "title")

        for entity in db.query(model_cls).all():
            eid = getattr(entity, "_id", None)
            if (entity_type, eid) in existing:
                continue

            title = str(getattr(entity, title_field, None) or "")
            ts = getattr(entity, "created_at", None) or datetime.now(timezone.utc)

            entry = AuditLog(
                timestamp=ts,
                action="created",
                entity_type=entity_type,
                entity_id=eid,
                title=title,
                summary=f"{entity_type.replace('_', ' ').title()} created: {title}",
                changes=_snapshot_entity(entity),
                extra=_extra_from_entity(entity),
                created_by=getattr(entity, "created_by", None),
                owner=getattr(entity, "owner", None),
            )
            db.add(entry)
            count += 1

    if count > 0:
        db.commit()
        log.info("Backfilled %d audit entries", count)

    return count
