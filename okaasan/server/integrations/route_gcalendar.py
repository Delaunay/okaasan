import traceback
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request

from . import gcalendar

router = APIRouter(prefix="/gcalendar", tags=["google-calendar"])


def _init_config(request: Request):
    """Lazily point gcalendar at the data config dir on first request."""
    cfg_dir = Path(request.app.state.upload_folder) / "data" / "_config"
    gcalendar.set_config_dir(cfg_dir)


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
