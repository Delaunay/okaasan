"""SQLAlchemy ORM event listeners for automatic audit logging.

All hooks use ``after_flush`` to inspect the session's new, dirty, and deleted
sets.  This runs inside the same transaction as the original changes and uses
``Session.info`` for the insert so that the audit rows participate in the same
commit.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Set, Type

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from .model import AuditLog

log = logging.getLogger(__name__)

_tracked_models: Set[Type] = set()


def _get_entity_type(target) -> str:
    return getattr(target.__class__, "__audit_entity_type__", target.__class__.__name__.lower())


def _get_title(target) -> str | None:
    field = getattr(target.__class__, "__audit_title_field__", "title")
    return str(getattr(target, field, None) or "")


def _get_entity_id(target) -> int | None:
    return getattr(target, "_id", None)


def _snapshot_columns(target) -> dict[str, Any]:
    """Return a dict of all column values for the target."""
    mapper = inspect(target.__class__)
    result = {}
    for col in mapper.columns:
        key = col.key
        val = getattr(target, key, None)
        if isinstance(val, datetime):
            val = val.isoformat()
        result[key] = val
    return result


def _diff_columns(target) -> dict[str, dict[str, Any]] | None:
    """Return a dict of changed columns with old/new values.

    Returns ``None`` if nothing actually changed.
    """
    insp = inspect(target)
    changes = {}
    for attr in insp.attrs:
        hist = attr.history
        if hist.has_changes():
            old = hist.deleted
            new = hist.added

            def _serialize(vals):
                out = []
                for v in vals:
                    if isinstance(v, datetime):
                        out.append(v.isoformat())
                    else:
                        out.append(v)
                if len(out) == 1:
                    return out[0]
                return out

            changes[attr.key] = {
                "old": _serialize(old) if old else None,
                "new": _serialize(new) if new else None,
            }
    return changes or None


def _build_extra(target) -> dict[str, Any] | None:
    """Extract extra metadata from the entity for the audit row."""
    extra = {}
    for field in ("tags", "article_kind", "tag", "kind"):
        val = getattr(target, field, None)
        if val is not None:
            extra[field] = val
    return extra or None


def _make_summary(action: str, entity_type: str, title: str, changes: dict | None) -> str:
    if action == "created":
        return f"{entity_type.replace('_', ' ').title()} created: {title}"
    elif action == "deleted":
        return f"{entity_type.replace('_', ' ').title()} deleted: {title}"
    elif changes:
        fields = ", ".join(changes.keys())
        return f"{entity_type.replace('_', ' ').title()} updated ({fields}): {title}"
    return f"{entity_type.replace('_', ' ').title()} updated: {title}"


def _on_after_flush(session: Session, flush_context):
    """Process all new, modified, and deleted objects in a single pass."""
    audit_rows = []

    for target in session.new:
        if target.__class__ not in _tracked_models:
            continue
        if isinstance(target, AuditLog):
            continue

        snapshot = _snapshot_columns(target)
        entity_type = _get_entity_type(target)
        title = _get_title(target)

        audit_rows.append(AuditLog(
            timestamp=datetime.now(timezone.utc),
            action="created",
            entity_type=entity_type,
            entity_id=_get_entity_id(target),
            title=title,
            summary=_make_summary("created", entity_type, title, None),
            changes=snapshot,
            extra=_build_extra(target),
            created_by=getattr(target, "created_by", None),
            owner=getattr(target, "owner", None),
        ))

    for target in session.dirty:
        if target.__class__ not in _tracked_models:
            continue
        if isinstance(target, AuditLog):
            continue
        if not session.is_modified(target, include_collections=False):
            continue

        changes = _diff_columns(target)
        if not changes:
            continue

        entity_type = _get_entity_type(target)
        title = _get_title(target)

        audit_rows.append(AuditLog(
            timestamp=datetime.now(timezone.utc),
            action="updated",
            entity_type=entity_type,
            entity_id=_get_entity_id(target),
            title=title,
            summary=_make_summary("updated", entity_type, title, changes),
            changes=changes,
            extra=_build_extra(target),
            created_by=getattr(target, "created_by", None),
            owner=getattr(target, "owner", None),
        ))

    for target in session.deleted:
        if target.__class__ not in _tracked_models:
            continue
        if isinstance(target, AuditLog):
            continue

        snapshot = _snapshot_columns(target)
        entity_type = _get_entity_type(target)
        title = _get_title(target)

        audit_rows.append(AuditLog(
            timestamp=datetime.now(timezone.utc),
            action="deleted",
            entity_type=entity_type,
            entity_id=_get_entity_id(target),
            title=title,
            summary=_make_summary("deleted", entity_type, title, None),
            changes=snapshot,
            extra=_build_extra(target),
            created_by=getattr(target, "created_by", None),
            owner=getattr(target, "owner", None),
        ))

    for row in audit_rows:
        session.add(row)


def register_hooks(*models: Type):
    """Register the given model classes for audit tracking.

    Call this once at startup.  The ``after_flush`` listener is attached to
    the ``Session`` class (not an instance) so it fires for every session.
    """
    newly_added = False
    for model_cls in models:
        if model_cls not in _tracked_models:
            _tracked_models.add(model_cls)
            newly_added = True
            log.info("Audit tracking enabled for %s", model_cls.__name__)

    if newly_added and len(_tracked_models) == len(models):
        event.listen(Session, "after_flush", _on_after_flush)
