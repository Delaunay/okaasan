"""FastAPI routes for the health data system.

Provides data-only endpoints (the frontend owns the Vega-Lite specs),
import/sync triggers, and connector management.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from .models import HealthMetric, HealthActivity, HealthDailySummary, HealthConnector

log = logging.getLogger("okaasan.health.routes")


def _get_db_factory(engine):
    from sqlalchemy.orm import sessionmaker

    SL = sessionmaker(bind=engine)

    def get_db():
        db = SL()
        try:
            yield db
        finally:
            db.close()

    return get_db


def _parse_date(s: Optional[str]) -> Optional[datetime]:
    """Parse a date string into a naive (UTC) datetime for SQLite queries."""
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    except ValueError:
        try:
            return datetime.strptime(s, "%Y-%m-%d")
        except ValueError:
            return None


# ── Router factory ────────────────────────────────────────────────────

def create_health_router(engine) -> APIRouter:
    router = APIRouter(prefix="/health-data")
    get_db = _get_db_factory(engine)

    # ------------------------------------------------------------------
    # Data endpoints  (consumed by Vega via URL data sources)
    # ------------------------------------------------------------------

    @router.get("/metrics")
    def get_metrics(
        type: str = Query(..., alias="type"),
        start: Optional[str] = None,
        end: Optional[str] = None,
        resolution: Optional[int] = None,
        db: Session = Depends(get_db),
    ):
        q = db.query(HealthMetric).filter(HealthMetric.metric_type == type)
        s, e = _parse_date(start), _parse_date(end)
        if s:
            q = q.filter(HealthMetric.timestamp >= s)
        if e:
            q = q.filter(HealthMetric.timestamp <= e)
        q = q.order_by(HealthMetric.timestamp)

        rows = q.all()

        if resolution and resolution > 0 and len(rows) > resolution:
            step = max(1, len(rows) // resolution)
            rows = rows[::step]

        return [r.to_json() for r in rows]

    @router.get("/activities")
    def get_activities(
        type: Optional[str] = None,
        start: Optional[str] = None,
        end: Optional[str] = None,
        db: Session = Depends(get_db),
    ):
        q = db.query(HealthActivity)
        if type:
            q = q.filter(HealthActivity.activity_type == type)
        s, e = _parse_date(start), _parse_date(end)
        if s:
            q = q.filter(HealthActivity.start_time >= s)
        if e:
            q = q.filter(HealthActivity.start_time <= e)
        return [a.to_json() for a in q.order_by(desc(HealthActivity.start_time)).all()]

    @router.get("/summary")
    def get_summary(date: Optional[str] = None, db: Session = Depends(get_db)):
        if date:
            day = datetime.strptime(date, "%Y-%m-%d")
        else:
            day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)

        summary: dict[str, Any] = {}
        for mt in ("heart_rate", "hrv", "stress", "respiration", "body_battery"):
            row = (
                db.query(HealthMetric)
                .filter(
                    HealthMetric.metric_type == mt,
                    HealthMetric.timestamp >= day_start,
                    HealthMetric.timestamp < day_end,
                )
                .order_by(desc(HealthMetric.timestamp))
                .first()
            )
            if not row:
                row = (
                    db.query(HealthMetric)
                    .filter(HealthMetric.metric_type == mt)
                    .order_by(desc(HealthMetric.timestamp))
                    .first()
                )
            if row:
                summary[mt] = {"value": row.value, "unit": row.unit, "timestamp": row.timestamp.isoformat() + "Z"}

        activities = (
            db.query(HealthActivity)
            .filter(HealthActivity.start_time >= day_start, HealthActivity.start_time < day_end)
            .all()
        )
        summary["activities"] = [a.to_json() for a in activities]
        summary["date"] = day_start.strftime("%Y-%m-%d")
        return summary

    @router.get("/weekly-summary")
    def get_weekly_summary(db: Session = Depends(get_db)):
        now = datetime.utcnow()
        week_ago = now - timedelta(days=7)

        averages: dict[str, Any] = {}
        for mt in ("heart_rate", "hrv", "spo2", "vo2max"):
            row = (
                db.query(func.avg(HealthMetric.value), func.count(HealthMetric._id))
                .filter(HealthMetric.metric_type == mt, HealthMetric.timestamp >= week_ago)
                .first()
            )
            if row and row[0] is not None:
                averages[mt] = {"avg": round(row[0], 1), "count": row[1]}

        activity_count = (
            db.query(func.count(HealthActivity._id))
            .filter(HealthActivity.start_time >= week_ago)
            .scalar()
        )
        averages["total_activities"] = activity_count
        return averages

    # ------------------------------------------------------------------
    # Chart data endpoints — return plain arrays for Vega URL data sources
    # ------------------------------------------------------------------

    def _default_range(start: Optional[str], end: Optional[str]):
        e = _parse_date(end) or datetime.utcnow()
        s = _parse_date(start) or (e - timedelta(days=7))
        return s, e

    def _metric_rows(db: Session, metric_type: str, start: datetime, end: datetime) -> list[dict]:
        rows = (
            db.query(HealthMetric.timestamp, HealthMetric.value)
            .filter(
                HealthMetric.metric_type == metric_type,
                HealthMetric.timestamp >= start,
                HealthMetric.timestamp <= end,
            )
            .order_by(HealthMetric.timestamp)
            .all()
        )
        return [{"t": r.timestamp.isoformat() + "Z", "v": r.value} for r in rows]

    @router.get("/data/heart-rate")
    def data_heart_rate(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "heart_rate", s, e)

    @router.get("/data/hrv")
    def data_hrv(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "hrv", s, e)

    @router.get("/data/spo2")
    def data_spo2(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "spo2", s, e)

    @router.get("/data/vo2max")
    def data_vo2max(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "vo2max", s, e)

    @router.get("/data/stress")
    def data_stress(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "stress", s, e)

    @router.get("/data/body-battery")
    def data_body_battery(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "body_battery", s, e)

    @router.get("/data/steps")
    def data_steps(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "steps", s, e)

    @router.get("/data/respiration")
    def data_respiration(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        return _metric_rows(db, "respiration", s, e)

    @router.get("/data/daily-summary")
    def data_daily_summary(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        from datetime import date as date_cls
        s, e = _default_range(start, end)
        rows = (
            db.query(HealthDailySummary)
            .filter(HealthDailySummary.day >= s.date() if hasattr(s, 'date') else s,
                    HealthDailySummary.day <= e.date() if hasattr(e, 'date') else e)
            .order_by(HealthDailySummary.day)
            .all()
        )
        return [r.to_json() for r in rows]

    @router.get("/data/sleep")
    def data_sleep(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        activities = (
            db.query(HealthActivity)
            .filter(
                HealthActivity.activity_type == "sleep",
                HealthActivity.start_time >= s,
                HealthActivity.start_time <= e,
            )
            .order_by(HealthActivity.start_time)
            .all()
        )
        rows: list[dict] = []
        for a in activities:
            day_iso = a.start_time.strftime("%Y-%m-%d")
            smry = a.summary or {}
            for stage, key in [("Deep", "deep_seconds"), ("Light", "light_seconds"), ("REM", "rem_seconds"), ("Awake", "awake_seconds")]:
                val = smry.get(key)
                if val:
                    rows.append({"date": day_iso, "stage": stage, "hours": round(val / 3600, 2)})
        return rows

    _WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    def _to_night_hour(dt: datetime, tz_offset_sec: int = 0) -> float:
        """Convert a UTC datetime to a continuous local 'night hour' scale.

        Applies tz_offset_sec to get local time, then wraps hours
        before 18:00 to 24+ so sleep spanning midnight is continuous.
        E.g. local 22:30 → 22.5, local 0:00 → 24.0, local 6:00 → 30.0.
        """
        local = dt + timedelta(seconds=tz_offset_sec)
        h = local.hour + local.minute / 60 + local.second / 3600
        if h < 18:
            h += 24
        return round(h, 3)

    @router.get("/data/sleep-overlay")
    def data_sleep_overlay(
        start: Optional[str] = None,
        end: Optional[str] = None,
        nights: int = 14,
        db: Session = Depends(get_db),
    ):
        """Return sleep stage bars grouped by day-of-week with real clock times."""
        query = db.query(HealthActivity).filter(HealthActivity.activity_type == "sleep")

        s = _parse_date(start)
        e = _parse_date(end)
        if s:
            query = query.filter(HealthActivity.start_time >= s)
        if e:
            query = query.filter(HealthActivity.start_time <= e + timedelta(days=1))

        activities = query.order_by(desc(HealthActivity.start_time)).limit(nights * 3).all()

        rows: list[dict] = []
        night_idx = 0
        for a in activities:
            ext = a.extension or {}
            sleep_levels = ext.get("sleep_levels", [])
            if not sleep_levels or not a.start_time:
                continue

            tz_off = ext.get("tz_offset_sec", 0) or 0
            local_bed = a.start_time + timedelta(seconds=tz_off)
            date_label = local_bed.strftime("%m/%d")
            weekday = _WEEKDAY_ORDER[local_bed.weekday()]

            for lvl in sleep_levels:
                try:
                    s_dt = datetime.fromisoformat(lvl["start"].replace("Z", "+00:00")).replace(tzinfo=None)
                    e_dt = datetime.fromisoformat(lvl["end"].replace("Z", "+00:00")).replace(tzinfo=None)
                except (ValueError, KeyError):
                    continue
                rows.append({
                    "night": date_label,
                    "weekday": weekday,
                    "weekday_num": local_bed.weekday(),
                    "week_offset": night_idx,
                    "stage": lvl.get("stage", "Unknown"),
                    "start_h": _to_night_hour(s_dt, tz_off),
                    "end_h": _to_night_hour(e_dt, tz_off),
                    "hours": round((e_dt - s_dt).total_seconds() / 3600, 2),
                })

            night_idx += 1
            if night_idx >= nights:
                break

        return rows

    @router.get("/data/activities")
    def data_activities(start: Optional[str] = None, end: Optional[str] = None, db: Session = Depends(get_db)):
        s, e = _default_range(start, end)
        activities = (
            db.query(HealthActivity)
            .filter(
                HealthActivity.activity_type != "sleep",
                HealthActivity.start_time >= s,
                HealthActivity.start_time <= e,
            )
            .order_by(HealthActivity.start_time)
            .all()
        )
        return [
            {
                "date": a.start_time.isoformat() + "Z",
                "type": a.activity_type,
                "duration_min": round((a.duration_seconds or 0) / 60, 1),
                "distance_km": round((a.distance_m or 0) / 1000, 1),
            }
            for a in activities
        ]

    @router.get("/data/weekly-overlay")
    def data_weekly_overlay(
        metric: str = "heart_rate",
        weeks: int = 4,
        end: Optional[str] = None,
        tz_offset_min: int = 0,
        db: Session = Depends(get_db),
    ):
        tz_delta = timedelta(minutes=tz_offset_min)

        if end:
            anchor = _parse_date(end) or datetime.utcnow()
        else:
            anchor = datetime.utcnow()
        local_anchor = anchor + tz_delta
        today = local_anchor.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start_local = today - timedelta(days=today.weekday())

        labels = ["This week"] + [f"{i} week{'s' if i > 1 else ''} ago" for i in range(1, weeks)]

        rows: list[dict] = []
        for offset in range(weeks):
            ws_local = week_start_local - timedelta(weeks=offset)
            we_local = ws_local + timedelta(days=7)
            ws_utc = ws_local - tz_delta
            we_utc = we_local - tz_delta
            data = (
                db.query(HealthMetric.timestamp, HealthMetric.value)
                .filter(
                    HealthMetric.metric_type == metric,
                    HealthMetric.timestamp >= ws_utc,
                    HealthMetric.timestamp < we_utc,
                )
                .order_by(HealthMetric.timestamp)
                .all()
            )
            hourly: dict[float, list[float]] = {}
            for r in data:
                local_ts = r.timestamp + tz_delta
                day_frac = (local_ts - ws_local).total_seconds() / 86400
                bucket = round(day_frac * 4) / 4
                hourly.setdefault(bucket, []).append(r.value)

            for bucket, vals in sorted(hourly.items()):
                avg_val = sum(vals) / len(vals)
                actual_dt = ws_local + timedelta(days=bucket)
                rows.append({
                    "day_offset": round(bucket, 2),
                    "v": round(avg_val, 1),
                    "week_offset": offset,
                    "label": labels[offset],
                    "actual_date": actual_dt.isoformat() + "Z",
                })

        return rows

    # ------------------------------------------------------------------
    # Import / sync endpoints
    # ------------------------------------------------------------------

    def _upload_folder(request: Request) -> str:
        return request.app.state.upload_folder

    @router.post("/sync/garmin")
    async def sync_garmin(request: Request):
        import json as _json
        import queue
        import threading
        from starlette.responses import StreamingResponse
        from sqlalchemy.orm import sessionmaker

        body = await request.json()
        start_date = body.get("start")
        end_date = body.get("end")
        dup_threshold = body.get("dup_threshold", 3)
        replay = body.get("replay", False)

        from .garmin_connect import sync_day, _get_client
        from datetime import date as date_cls

        config_dir = Path(_upload_folder(request)) / "data" / "_config"

        if not end_date:
            end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%d")

        s = date_cls.fromisoformat(start_date)
        e = date_cls.fromisoformat(end_date)
        total_days = (e - s).days + 1

        SL = sessionmaker(bind=engine)
        q: queue.Queue = queue.Queue()

        def _worker():
            from ..notifications import hub as _hub
            client = None
            if not replay:
                try:
                    client = _get_client(config_dir)
                except Exception as exc:
                    q.put({"error": str(exc), "fatal": True})
                    return

            _hub.publish({"type": "garmin_sync", "status": "started", "total_days": total_days})

            day = e
            idx = 0
            consecutive_dups = 0

            while day >= s:
                idx += 1
                evt: dict = {"day": day.isoformat(), "progress": idx, "total": total_days}
                db = SL()
                try:
                    r = sync_day(db, config_dir, day, client=client, replay=replay)
                    evt["result"] = r
                    inserted = sum(
                        v.get("inserted", 0) for v in r.values() if isinstance(v, dict)
                    )
                    if inserted == 0:
                        consecutive_dups += 1
                    else:
                        consecutive_dups = 0
                except Exception as exc:
                    evt["error"] = str(exc)
                    consecutive_dups = 0
                finally:
                    db.close()

                q.put(evt)

                if consecutive_dups >= dup_threshold:
                    msg = f"No new data for {dup_threshold} consecutive days"
                    q.put({"stopped": True, "reason": msg, "days_synced": idx})
                    _hub.publish({"type": "garmin_sync", "status": "done", "days_synced": idx, "message": f"Sync stopped: {msg}"})
                    return

                day -= timedelta(days=1)

            q.put({"done": True, "days_synced": idx})
            _hub.publish({"type": "garmin_sync", "status": "done", "days_synced": idx, "message": f"Synced {idx} days"})

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

        def _stream():
            while True:
                try:
                    evt = q.get(timeout=120)
                except queue.Empty:
                    yield f"data: {_json.dumps({'error': 'Sync timed out'})}\n\n"
                    return
                yield f"data: {_json.dumps(evt)}\n\n"
                if evt.get("done") or evt.get("stopped") or evt.get("fatal"):
                    return

        return StreamingResponse(
            _stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @router.post("/import/garmin-export")
    async def import_garmin_export_endpoint(
        request: Request,
        file: UploadFile = File(...),
        db: Session = Depends(get_db),
    ):
        import json as _json
        import queue
        import threading
        from starlette.responses import StreamingResponse
        from sqlalchemy.orm import sessionmaker

        contents = await file.read()
        upload_dir = Path(_upload_folder(request))
        export_dir = upload_dir / "data" / "private" / "garmin_dump"
        export_dir.mkdir(parents=True, exist_ok=True)
        zip_path = export_dir / (file.filename or "garmin_export.zip")
        zip_path.write_bytes(contents)

        SL = sessionmaker(bind=engine)
        q: queue.Queue = queue.Queue()

        def _worker():
            from .garmin_export import import_garmin_export
            db_w = SL()
            try:
                result = import_garmin_export(
                    db_w,
                    zip_path,
                    upload_dir,
                    on_progress=lambda msg: q.put({"progress": msg}),
                )
                q.put({"done": True, "result": result})
            except Exception as exc:
                q.put({"error": str(exc), "fatal": True})
            finally:
                db_w.close()

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

        def _stream():
            while True:
                try:
                    evt = q.get(timeout=300)
                except queue.Empty:
                    yield f"data: {_json.dumps({'error': 'Import timed out'})}\n\n"
                    return
                yield f"data: {_json.dumps(evt)}\n\n"
                if evt.get("done") or evt.get("fatal"):
                    return

        return StreamingResponse(
            _stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @router.post("/import/garmin-export-path")
    async def import_garmin_export_from_path(
        request: Request,
        db: Session = Depends(get_db),
    ):
        """Import from a Garmin export ZIP already on disk."""
        import json as _json
        import queue
        import threading
        from starlette.responses import StreamingResponse
        from sqlalchemy.orm import sessionmaker

        body = await request.json()
        zip_path = body.get("path")
        if not zip_path or not Path(zip_path).is_file():
            raise HTTPException(status_code=400, detail="path must point to an existing ZIP file")

        upload_dir = Path(_upload_folder(request))
        SL = sessionmaker(bind=engine)
        q: queue.Queue = queue.Queue()

        def _worker():
            from .garmin_export import import_garmin_export
            db_w = SL()
            try:
                result = import_garmin_export(
                    db_w,
                    zip_path,
                    upload_dir,
                    on_progress=lambda msg: q.put({"progress": msg}),
                )
                q.put({"done": True, "result": result})
            except Exception as exc:
                q.put({"error": str(exc), "fatal": True})
            finally:
                db_w.close()

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

        def _stream():
            while True:
                try:
                    evt = q.get(timeout=300)
                except queue.Empty:
                    yield f"data: {_json.dumps({'error': 'Import timed out'})}\n\n"
                    return
                yield f"data: {_json.dumps(evt)}\n\n"
                if evt.get("done") or evt.get("fatal"):
                    return

        return StreamingResponse(
            _stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @router.post("/import/fit")
    async def import_fit_upload(
        request: Request,
        file: UploadFile = File(...),
        db: Session = Depends(get_db),
    ):
        from .fit_reader import save_uploaded_fit, import_fit_file

        contents = await file.read()
        dest = save_uploaded_fit(contents, file.filename or "upload.fit", _upload_folder(request))
        result = import_fit_file(db, dest)
        return result

    @router.post("/import/fit-copy")
    async def import_fit_copy(request: Request, db: Session = Depends(get_db)):
        body = await request.json()
        source_dir = body.get("source_dir")
        if not source_dir:
            raise HTTPException(status_code=400, detail="source_dir is required")

        from .fit_reader import copy_fit_files, import_fit_file

        new_files = copy_fit_files(source_dir, _upload_folder(request))
        results: list[dict] = []
        for f in new_files:
            try:
                results.append(import_fit_file(db, f))
            except Exception as exc:
                results.append({"file": f.name, "error": str(exc)})

        return {"copied": len(new_files), "results": results}

    @router.post("/import/fit-reprocess")
    async def import_fit_reprocess(request: Request, db: Session = Depends(get_db)):
        from .fit_reader import import_all_local

        results = import_all_local(db, _upload_folder(request))
        return {"results": results}

    # ------------------------------------------------------------------
    # Connector management
    # ------------------------------------------------------------------

    @router.get("/connectors")
    def list_connectors(db: Session = Depends(get_db)):
        rows = db.query(HealthConnector).all()
        if not rows:
            defaults = [
                HealthConnector(name="garmin", enabled=False, config={}),
                HealthConnector(name="fit_file", enabled=True, config={}),
            ]
            for d in defaults:
                db.add(d)
            db.commit()
            rows = defaults
        return [r.to_json() for r in rows]

    @router.put("/connectors/{name}")
    async def update_connector(name: str, request: Request, db: Session = Depends(get_db)):
        body = await request.json()
        row = db.query(HealthConnector).filter(HealthConnector.name == name).first()
        if not row:
            row = HealthConnector(name=name)
            db.add(row)

        if "enabled" in body:
            row.enabled = body["enabled"]
        if "config" in body:
            row.config = body["config"]

        db.commit()
        return row.to_json()

    @router.post("/connectors/garmin/login")
    async def garmin_login_endpoint(request: Request, db: Session = Depends(get_db)):
        body = await request.json()
        email = body.get("email")
        password = body.get("password")
        if not email or not password:
            raise HTTPException(status_code=400, detail="email and password required")

        from .garmin_connect import garmin_login

        config_dir = Path(_upload_folder(request)) / "data" / "_config"
        try:
            result = garmin_login(config_dir, email, password)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        conn = db.query(HealthConnector).filter(HealthConnector.name == "garmin").first()
        if not conn:
            conn = HealthConnector(name="garmin", enabled=True, config={})
            db.add(conn)
        conn.enabled = True
        conn.config = {**(conn.config or {}), "email": email, "display_name": result.get("display_name", "")}
        conn.last_error = None
        db.commit()

        return {"status": "ok", "display_name": result.get("display_name", "")}

    # ------------------------------------------------------------------
    # USB auto-import (Garmin plugged in via USB)
    # ------------------------------------------------------------------

    @router.post("/import/usb-garmin")
    async def import_usb_garmin(request: Request):
        import json as _json
        import threading
        from starlette.responses import JSONResponse
        from sqlalchemy.orm import sessionmaker

        body = await request.json()
        mount_path = body.get("mount_path")
        if not mount_path:
            raise HTTPException(status_code=400, detail="mount_path is required")

        garmin_dir = Path(mount_path) / "GARMIN"
        if not garmin_dir.is_dir():
            raise HTTPException(status_code=400, detail=f"GARMIN directory not found at {garmin_dir}")

        upload_dir = Path(_upload_folder(request))
        SL = sessionmaker(bind=engine)

        def _worker():
            from .fit_reader import copy_fit_files, import_fit_file
            from ..notifications import hub as _hub
            db_w = SL()
            try:
                _hub.publish({"type": "usb_import", "status": "started"})

                new_files = copy_fit_files(str(garmin_dir), upload_dir)
                log.info("USB import: copied %d new FIT files from %s", len(new_files), garmin_dir)
                _hub.publish({"type": "usb_import", "status": "copying", "files_found": len(new_files)})

                imported, errors = 0, 0
                for i, f in enumerate(new_files):
                    try:
                        import_fit_file(db_w, f)
                        imported += 1
                    except Exception as exc:
                        log.warning("USB FIT import error %s: %s", f.name, exc)
                        errors += 1
                    if (i + 1) % 20 == 0:
                        _hub.publish({"type": "usb_import", "status": "importing", "progress": i + 1, "total": len(new_files)})

                log.info("USB import complete: %d imported, %d errors", imported, errors)

                result = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "files_copied": len(new_files),
                    "files_imported": imported,
                    "errors": errors,
                }

                conn = db_w.query(HealthConnector).filter(HealthConnector.name == "fit_file").first()
                if conn:
                    config = dict(conn.config or {})
                    config["last_usb_import"] = result
                    conn.config = config
                    db_w.commit()

                _hub.publish({"type": "usb_import", "status": "done", **result})
            except Exception as exc:
                log.error("USB import failed: %s", exc)
                _hub.publish({"type": "usb_import", "status": "error", "error": str(exc)})
            finally:
                db_w.close()

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

        return JSONResponse(status_code=202, content={"status": "started", "mount_path": mount_path})

    @router.get("/usb-garmin/status")
    def usb_garmin_status(db: Session = Depends(get_db)):
        rule_installed = Path("/etc/udev/rules.d/99-garmin.rules").exists()

        conn = db.query(HealthConnector).filter(HealthConnector.name == "fit_file").first()
        last_import = None
        if conn and conn.config:
            last_import = conn.config.get("last_usb_import")

        return {
            "rule_installed": rule_installed,
            "last_import": last_import,
        }

    # ------------------------------------------------------------------
    # Daily auto-sync scheduler
    # ------------------------------------------------------------------

    @router.get("/scheduler")
    def get_scheduler_status(request: Request, db: Session = Depends(get_db)):
        from .scheduler import is_running
        conn = db.query(HealthConnector).filter(HealthConnector.name == "garmin").first()
        cfg = conn.config or {} if conn else {}
        return {
            "enabled": bool(cfg.get("auto_sync")),
            "running": is_running(),
            "timezone": cfg.get("sync_timezone", "UTC"),
        }

    @router.post("/scheduler")
    async def toggle_scheduler(request: Request, db: Session = Depends(get_db)):
        from .scheduler import start_scheduler, stop_scheduler, is_running

        body = await request.json()
        enabled = body.get("enabled", False)
        tz_name = body.get("timezone")

        conn = db.query(HealthConnector).filter(HealthConnector.name == "garmin").first()
        if not conn:
            raise HTTPException(status_code=404, detail="Garmin connector not found")

        config = dict(conn.config or {})
        config["auto_sync"] = enabled
        if tz_name:
            config["sync_timezone"] = tz_name
        conn.config = config
        db.commit()

        tz = config.get("sync_timezone", "UTC")
        config_dir = Path(_upload_folder(request)) / "data" / "_config"
        if enabled:
            stop_scheduler()
            start_scheduler(engine, config_dir, tz_name=tz)
        else:
            stop_scheduler()

        return {"enabled": enabled, "running": is_running(), "timezone": tz}

    # Auto-start scheduler on router creation if previously enabled
    try:
        from sqlalchemy.orm import sessionmaker as _SM
        _sess = _SM(bind=engine)()
        _conn = _sess.query(HealthConnector).filter(HealthConnector.name == "garmin").first()
        if _conn and (_conn.config or {}).get("auto_sync"):
            from .scheduler import start_scheduler
            _tz = (_conn.config or {}).get("sync_timezone", "UTC")
            start_scheduler(engine, Path("uploads") / "data" / "_config", tz_name=_tz)
        _sess.close()
    except Exception as exc:
        log.warning("Could not auto-start health scheduler: %s", exc)

    return router
