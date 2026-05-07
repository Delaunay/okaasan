import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from . import gcalendar
from ..calendar.models import Event

router = APIRouter(prefix="/gcalendar", tags=["google-calendar"])


def _init_config(request: Request):
    """Lazily point gcalendar at the data config dir on first request."""
    cfg_dir = Path(request.app.state.upload_folder) / "data" / "_config"
    gcalendar.set_config_dir(cfg_dir)


def get_db(request: Request):
    yield from request.app.state.get_db()


def _error_detail(exc: Exception) -> str:
    """Format an exception with its full traceback for the UI."""
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))


# ── Setup wizard endpoints ────────────────────────────────────

@router.get("/status")
def get_setup_status(request: Request):
    """Current setup status — drives the wizard UI."""
    _init_config(request)
    return gcalendar.get_status()


@router.post("/upload-key")
async def upload_service_account_key(request: Request):
    """Accept the service-account JSON key (as the request body)."""
    _init_config(request)
    try:
        key_data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if "client_email" not in key_data or "private_key" not in key_data:
        raise HTTPException(
            status_code=400,
            detail="This does not look like a Google service-account key "
                   "(missing client_email or private_key).",
        )

    email = gcalendar.save_service_account_key(key_data)
    return {"client_email": email}


@router.post("/select-calendar")
async def select_calendar(request: Request):
    """Save the chosen calendar id."""
    _init_config(request)
    try:
        body = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=_error_detail(exc))

    cal_id = body.get("calendar_id", "").strip()
    if not cal_id:
        raise HTTPException(status_code=400, detail="calendar_id is required")

    try:
        cfg = gcalendar.load_config()
        cfg["calendar_id"] = cal_id
        gcalendar.save_config(cfg)
        return {"calendar_id": cal_id}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


@router.post("/test")
def test_connection(request: Request):
    """Try to list calendars and fetch a few events as a connectivity check."""
    _init_config(request)
    try:
        calendars = gcalendar.list_calendars()
        events = gcalendar.fetch_week_events()
        return {
            "connected": True,
            "calendars": len(calendars),
            "events_this_week": len(events),
            "sample_events": events[:5],
        }
    except Exception as exc:
        return {"connected": False, "error": _error_detail(exc)}


# ── Data endpoints ────────────────────────────────────────────

@router.post("/add-calendar")
async def add_calendar(request: Request):
    """Verify access to a calendar by ID and save it as the selected calendar.

    The user enters their calendar ID (usually their Gmail address).
    We verify the service account can read it, then save the selection.
    """
    _init_config(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    cal_id = body.get("calendar_id", "").strip()
    if not cal_id:
        raise HTTPException(status_code=400, detail="calendar_id is required")

    try:
        info = gcalendar.verify_calendar_access(cal_id)
        cfg = gcalendar.load_config()
        cfg["calendar_id"] = cal_id
        gcalendar.save_config(cfg)
        return info
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


@router.get("/calendars")
def get_calendars(request: Request):
    """List all calendars the service account can see."""
    _init_config(request)
    try:
        return gcalendar.list_calendars()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


@router.get("/events/week")
def get_week_events(
    request: Request,
    date: str | None = Query(
        None, description="ISO date within the target week (e.g. 2026-04-24). Defaults to current week."
    ),
    calendar_id: str | None = Query(None, description="Override the default calendar id"),
):
    """Fetch Google Calendar events for the week containing *date*."""
    _init_config(request)
    try:
        ref = None
        if date:
            ref = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
        return gcalendar.fetch_week_events(reference_date=ref, calendar_id=calendar_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


@router.get("/events/year")
def get_year_events(
    request: Request,
    year: int | None = Query(None, description="Year to fetch (e.g. 2026). Defaults to current year."),
    calendar_id: str | None = Query(None, description="Override the default calendar id"),
):
    """Fetch Google Calendar events for an entire year."""
    _init_config(request)
    try:
        return gcalendar.fetch_year_events(year=year, calendar_id=calendar_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


@router.get("/events")
def get_events(
    request: Request,
    start: str | None = Query(None, description="ISO datetime for range start"),
    end: str | None = Query(None, description="ISO datetime for range end"),
    calendar_id: str | None = Query(None, description="Override the default calendar id"),
):
    """Fetch Google Calendar events for an arbitrary date range."""
    _init_config(request)
    try:
        if not start or not end:
            return gcalendar.fetch_week_events(calendar_id=calendar_id)

        time_min = datetime.fromisoformat(start)
        time_max = datetime.fromisoformat(end)
        return gcalendar.fetch_events(time_min, time_max, calendar_id=calendar_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


# ── Sync & Export ──────────────────────────────────────────────

def _parse_gcal_datetime(dt_str: str | None) -> datetime | None:
    """Parse a Google Calendar datetime string and normalize to naive UTC.

    SQLite does not persist timezone info, so we must convert to UTC
    before storing.  E.g. ``2026-05-07T11:00:00-04:00`` → naive
    ``2026-05-07T15:00:00`` (UTC).
    """
    if not dt_str:
        return None
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


@router.post("/sync")
def sync_events(
    request: Request,
    start: str | None = Query(None, description="ISO datetime for range start"),
    end: str | None = Query(None, description="ISO datetime for range end"),
    calendar_id: str | None = Query(None, description="Override the default calendar id"),
    db: Session = Depends(get_db),
):
    """Import Google Calendar events into the local DB with dedup.

    Matches on ``google_event_id``; creates new local Events for unknown
    Google events and updates changed ones.  Returns counts.
    """
    _init_config(request)
    try:
        if start and end:
            time_min = datetime.fromisoformat(start)
            time_max = datetime.fromisoformat(end)
            gcal_events = gcalendar.fetch_events(time_min, time_max, calendar_id=calendar_id)
        else:
            gcal_events = gcalendar.fetch_week_events(calendar_id=calendar_id)

        if not gcal_events:
            return {"created": 0, "updated": 0, "unchanged": 0}

        gcal_ids = [e["id"] for e in gcal_events if e.get("id")]
        existing = (
            db.query(Event)
            .filter(Event.google_event_id.in_(gcal_ids))
            .all()
        )
        existing_map = {e.google_event_id: e for e in existing}

        created = 0
        updated = 0
        unchanged = 0

        for ge in gcal_events:
            gid = ge.get("id")
            if not gid:
                continue

            dt_start = _parse_gcal_datetime(ge.get("datetime_start"))
            dt_end = _parse_gcal_datetime(ge.get("datetime_end"))
            if not dt_start or not dt_end:
                continue

            local = existing_map.get(gid)
            if local:
                changed = False
                if local.title != ge.get("title"):
                    local.title = ge.get("title") or local.title
                    changed = True
                if local.datetime_start != dt_start:
                    local.datetime_start = dt_start
                    changed = True
                if local.datetime_end != dt_end:
                    local.datetime_end = dt_end
                    changed = True
                if local.location != ge.get("location"):
                    local.location = ge.get("location")
                    changed = True
                if local.description != ge.get("description"):
                    local.description = ge.get("description")
                    changed = True
                if changed:
                    updated += 1
                else:
                    unchanged += 1
            else:
                event = Event(
                    title=ge.get("title", "(no title)"),
                    description=ge.get("description"),
                    datetime_start=dt_start,
                    datetime_end=dt_end,
                    location=ge.get("location"),
                    color=ge.get("color", "#4285F4"),
                    kind=0,
                    done=False,
                    source="google",
                    google_event_id=gid,
                    active=True,
                )
                db.add(event)
                created += 1

        db.commit()
        return {"created": created, "updated": updated, "unchanged": unchanged}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


@router.post("/export")
async def export_events(
    request: Request,
    db: Session = Depends(get_db),
):
    """Export local events to Google Calendar.

    Body: ``{"event_ids": [1, 2, 3]}``
    For each event, creates or updates on Google and stores the
    returned Google event ID locally.
    """
    _init_config(request)
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_ids = body.get("event_ids", [])
    if not event_ids:
        raise HTTPException(status_code=400, detail="event_ids is required")

    try:
        events = db.query(Event).filter(Event._id.in_(event_ids)).all()
        exported = 0
        updated_count = 0

        for event in events:
            event_data = {
                "summary": event.title,
                "description": event.description,
                "location": event.location,
                "start": {"dateTime": event.datetime_start.isoformat() + "Z"},
                "end": {"dateTime": event.datetime_end.isoformat() + "Z"},
            }

            if event.google_event_id:
                gcalendar.update_google_event(event.google_event_id, event_data)
                updated_count += 1
            else:
                result = gcalendar.create_google_event(event_data)
                event.google_event_id = result.get("id")
                event.source = "google"
                exported += 1

        db.commit()
        return {"exported": exported, "updated": updated_count}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))
