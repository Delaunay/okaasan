"""Feed API routes -- thin layer over audit.queries."""

from __future__ import annotations

from datetime import date
from traceback import print_exc

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..audit import get_feed, get_report, get_entity_history, backfill as audit_backfill

router = APIRouter()


def get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/feed")
def feed(
    limit: int = 20,
    offset: int = 0,
    entity_type: str | None = None,
    action: str | None = None,
    created_by: str | None = None,
    owner: str | None = None,
    db: Session = Depends(get_db),
):
    try:
        entity_types = [t.strip() for t in entity_type.split(",")] if entity_type else None
        actions = [a.strip() for a in action.split(",")] if action else None
        return get_feed(
            db,
            limit=limit,
            offset=offset,
            entity_types=entity_types,
            actions=actions,
            created_by=created_by,
            owner=owner,
        )
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feed/report")
def feed_report(
    period: str = "week",
    date_str: str | None = None,
    entity_types: str | None = None,
    db: Session = Depends(get_db),
):
    try:
        ref_date = date.fromisoformat(date_str) if date_str else None
        types_list = [t.strip() for t in entity_types.split(",")] if entity_types else None

        if period not in ("week", "month", "year"):
            raise HTTPException(status_code=400, detail="period must be week, month, or year")

        return get_report(
            db,
            period=period,
            ref_date=ref_date,
            entity_types=types_list,
        )
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/feed/history/{entity_type}/{entity_id}")
def entity_history(
    entity_type: str,
    entity_id: int,
    db: Session = Depends(get_db),
):
    try:
        return get_entity_history(db, entity_type, entity_id)
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feed/backfill")
def backfill(db: Session = Depends(get_db)):
    """Seed the audit log with 'created' entries for all existing entities
    that don't yet have an audit trail."""
    try:
        count = audit_backfill(db)
        return {"backfilled": count}
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))
