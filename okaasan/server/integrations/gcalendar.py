"""Google Calendar client using a service account.

Credentials are resolved in order:
1. Config file saved by the setup wizard (``<data>/_config/_gcalendar_key.json``).
2. ``GOOGLE_SERVICE_ACCOUNT_FILE`` env var pointing to a key file on disk.

The selected calendar id is read from ``<data>/_config/_gcalendar.json``
then falls back to the ``GOOGLE_CALENDAR_ID`` env var, then ``"primary"``.
"""

from __future__ import annotations

import json
import os
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from ..paths import private_folder

log = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar"]

_config_dir: Optional[Path] = None


def set_config_dir(path: Path) -> None:
    """Called once at startup so the module knows where configs live."""
    global _config_dir
    _config_dir = path
    _config_dir.mkdir(parents=True, exist_ok=True)


def _config_path() -> Path:
    return private_folder() / "_gcalendar.json"


def _key_path() -> Path:
    return private_folder() / "_gcalendar_key.json"


# ── Config persistence ───────────────────────────────────────

def load_config() -> dict:
    p = _config_path()
    if p.is_file():
        with open(p) as f:
            return json.load(f)
    return {}


def save_config(cfg: dict) -> None:
    with open(_config_path(), "w") as f:
        json.dump(cfg, f, indent=2)


def save_service_account_key(key_data: dict) -> str:
    """Persist the service-account JSON key and return the client_email."""
    with open(_key_path(), "w") as f:
        json.dump(key_data, f, indent=2)
    return key_data.get("client_email", "")


def get_status() -> dict:
    """Return the current setup status for the UI."""
    cfg = load_config()
    key_exists = _key_path().is_file()
    client_email = ""
    if key_exists:
        try:
            with open(_key_path()) as f:
                client_email = json.load(f).get("client_email", "")
        except Exception:
            pass

    return {
        "key_uploaded": key_exists,
        "client_email": client_email,
        "calendar_id": cfg.get("calendar_id", ""),
        "setup_complete": key_exists and bool(cfg.get("calendar_id")),
    }


# ── Google API helpers ───────────────────────────────────────

_ipv4_patched = False

def _ensure_ipv4():
    """Prefer IPv4 for DNS resolution.

    On some networks (e.g. home NAS), IPv6 connections to Google hang for
    ~10-30s before falling back to IPv4.  This filters getaddrinfo results
    to prefer AF_INET, eliminating the delay.
    """
    global _ipv4_patched
    if _ipv4_patched:
        return
    import socket
    _orig = socket.getaddrinfo

    def _prefer_ipv4(*args, **kwargs):
        results = _orig(*args, **kwargs)
        ipv4 = [r for r in results if r[0] == socket.AF_INET]
        return ipv4 if ipv4 else results

    socket.getaddrinfo = _prefer_ipv4
    _ipv4_patched = True


def _get_service():
    from google.oauth2.service_account import Credentials
    from googleapiclient.discovery import build

    _ensure_ipv4()

    kp = _key_path()
    if kp.is_file():
        credentials = Credentials.from_service_account_file(str(kp), scopes=SCOPES)
    else:
        cred_path = os.environ.get("GOOGLE_SERVICE_ACCOUNT_FILE")
        if not cred_path:
            raise RuntimeError(
                "No service account key found. "
                "Upload one through Settings or set GOOGLE_SERVICE_ACCOUNT_FILE."
            )
        credentials = Credentials.from_service_account_file(cred_path, scopes=SCOPES)

    return build("calendar", "v3", credentials=credentials, cache_discovery=False)


def _calendar_id() -> str:
    cfg = load_config()
    return cfg.get("calendar_id") or os.environ.get("GOOGLE_CALENDAR_ID", "primary")


def _normalize_event(raw: dict) -> dict:
    """Turn a Google Calendar event into a shape compatible with the local Event model."""
    start = raw.get("start", {})
    end = raw.get("end", {})

    start_dt = start.get("dateTime") or start.get("date")
    end_dt = end.get("dateTime") or end.get("date")

    return {
        "id": raw.get("id"),
        "title": raw.get("summary", "(no title)"),
        "description": raw.get("description"),
        "datetime_start": start_dt,
        "datetime_end": end_dt,
        "location": raw.get("location"),
        "color": "#4285F4",
        "kind": 0,
        "done": False,
        "source": "google",
        "link": raw.get("htmlLink"),
        "status": raw.get("status"),
        "attendees": [
            a.get("email") for a in raw.get("attendees", [])
        ],
    }


def fetch_events(
    time_min: datetime,
    time_max: datetime,
    calendar_id: Optional[str] = None,
    max_results: int = 2500,
) -> list[dict]:
    """Fetch events between *time_min* and *time_max* (both tz-aware)."""
    service = _get_service()
    cal_id = calendar_id or _calendar_id()

    if time_min.tzinfo is None:
        time_min = time_min.replace(tzinfo=timezone.utc)
    if time_max.tzinfo is None:
        time_max = time_max.replace(tzinfo=timezone.utc)

    events: list[dict] = []
    page_token: Optional[str] = None

    while True:
        result = (
            service.events()
            .list(
                calendarId=cal_id,
                timeMin=time_min.isoformat(),
                timeMax=time_max.isoformat(),
                maxResults=min(max_results - len(events), 2500),
                singleEvents=True,
                orderBy="startTime",
                pageToken=page_token,
            )
            .execute()
        )

        for item in result.get("items", []):
            events.append(_normalize_event(item))

        page_token = result.get("nextPageToken")
        if not page_token or len(events) >= max_results:
            break

    return events


def fetch_week_events(
    reference_date: Optional[datetime] = None,
    calendar_id: Optional[str] = None,
) -> list[dict]:
    """Fetch events for the week containing *reference_date* (Monday–Sunday)."""
    ref = reference_date or datetime.now(timezone.utc)
    monday = ref - timedelta(days=ref.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    sunday = monday + timedelta(days=6, hours=23, minutes=59, seconds=59)
    return fetch_events(monday, sunday, calendar_id=calendar_id)


def fetch_year_events(
    year: Optional[int] = None,
    calendar_id: Optional[str] = None,
) -> list[dict]:
    """Fetch all events for a given year."""
    y = year or datetime.now(timezone.utc).year
    start = datetime(y, 1, 1, tzinfo=timezone.utc)
    end = datetime(y, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    return fetch_events(start, end, calendar_id=calendar_id)


def verify_calendar_access(calendar_id: str) -> dict:
    """Check that the service account can read events from *calendar_id*.

    Returns basic calendar metadata on success.  Raises on failure.
    """
    service = _get_service()
    cal = service.calendars().get(calendarId=calendar_id).execute()
    return {
        "id": cal["id"],
        "summary": cal.get("summary"),
        "description": cal.get("description"),
    }


def create_google_event(
    event_data: dict,
    calendar_id: Optional[str] = None,
) -> dict:
    """Create an event on Google Calendar. Returns the created event."""
    service = _get_service()
    cal_id = calendar_id or _calendar_id()
    return service.events().insert(calendarId=cal_id, body=event_data).execute()


def update_google_event(
    google_event_id: str,
    event_data: dict,
    calendar_id: Optional[str] = None,
) -> dict:
    """Update an existing event on Google Calendar. Returns the updated event."""
    service = _get_service()
    cal_id = calendar_id or _calendar_id()
    return (
        service.events()
        .update(calendarId=cal_id, eventId=google_event_id, body=event_data)
        .execute()
    )


def list_calendars() -> list[dict]:
    """List all calendars visible to the service account."""
    service = _get_service()
    result = service.calendarList().list().execute()
    return [
        {
            "id": cal["id"],
            "summary": cal.get("summary"),
            "description": cal.get("description"),
            "primary": cal.get("primary", False),
        }
        for cal in result.get("items", [])
    ]


# ── Sync into local DB ───────────────────────────────────────

def _parse_gcal_datetime(dt_str: str | None) -> "datetime | None":
    """Parse a Google Calendar datetime string and normalize to naive UTC."""
    if not dt_str:
        return None
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def sync_events_to_db(session_factory, time_min: datetime, time_max: datetime) -> dict:
    """Fetch Google Calendar events and upsert into the local Event table.

    Returns ``{"created": int, "updated": int, "unchanged": int}``.
    """
    from ..calendar.models import Event

    gcal_events = fetch_events(time_min, time_max)
    if not gcal_events:
        return {"created": 0, "updated": 0, "unchanged": 0}

    db = session_factory()
    try:
        gcal_ids = [e["id"] for e in gcal_events if e.get("id")]
        existing = db.query(Event).filter(Event.google_event_id.in_(gcal_ids)).all()
        existing_map = {e.google_event_id: e for e in existing}

        created = updated = unchanged = 0

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
                for attr, val in [
                    ("title", ge.get("title")),
                    ("datetime_start", dt_start),
                    ("datetime_end", dt_end),
                    ("location", ge.get("location")),
                    ("description", ge.get("description")),
                ]:
                    if getattr(local, attr) != val:
                        setattr(local, attr, val if val is not None else getattr(local, attr))
                        changed = True
                if changed:
                    updated += 1
                else:
                    unchanged += 1
            else:
                db.add(Event(
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
                ))
                created += 1

        db.commit()
        return {"created": created, "updated": updated, "unchanged": unchanged}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Background periodic sync ─────────────────────────────────

import threading
import time as _time


class GCalSyncScheduler:
    """Daemon thread that periodically syncs Google Calendar into the local DB."""

    def __init__(self, session_factory, interval_minutes: int = 15):
        self._session_factory = session_factory
        self._interval = interval_minutes * 60
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self):
        if self._thread and self._thread.is_alive():
            return

        status = get_status()
        if not status["setup_complete"]:
            log.info("Google Calendar not configured — periodic sync disabled")
            return

        from ..task_registry import registry
        self._stop_event.clear()
        registry.register("gcal_sync", "Google Calendar Sync")
        self._thread = threading.Thread(target=self._run, daemon=True, name="gcal-sync")
        self._thread.start()
        log.info("Google Calendar sync started (interval=%dm)", self._interval // 60)

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        log.info("Google Calendar sync stopped")

    def _run(self):
        from ..task_registry import registry

        _time.sleep(15)
        while not self._stop_event.is_set():
            now = datetime.now(timezone.utc)
            time_min = now.replace(hour=0, minute=0, second=0, microsecond=0)
            time_max = time_min + timedelta(days=14)

            registry.update("gcal_sync", status="running", detail="Syncing...")
            try:
                result = sync_events_to_db(self._session_factory, time_min, time_max)
                detail = f"+{result['created']} new, {result['updated']} updated"
                registry.update("gcal_sync", status="idle", detail=detail)
                log.debug("GCal sync: %s", detail)
            except Exception as e:
                log.error("GCal sync error: %s", e)
                registry.update("gcal_sync", status="error", error=str(e))

            self._stop_event.wait(self._interval)
