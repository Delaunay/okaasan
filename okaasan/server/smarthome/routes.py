"""Smart Home / Zigbee integration routes."""
from __future__ import annotations

import asyncio
import os
import shutil
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import Integer, cast, func
from sqlalchemy.orm import Session

from . import mqtt_client

router = APIRouter(prefix="/smarthome", tags=["smarthome"])

_SessionLocal = None  # set by server.py at startup


def _get_db() -> Session:
    if _SessionLocal is None:
        raise HTTPException(status_code=503, detail="Smart home DB not initialized")
    return _SessionLocal()

CONBEE_SERIAL_PREFIX = "usb-dresden_elektronik_ConBee"
Z2M_DATA_DIR = "/opt/zigbee2mqtt/data"
Z2M_CONFIG = f"{Z2M_DATA_DIR}/configuration.yaml"


def _detect_conbee() -> dict | None:
    """Check if a ConBee device is plugged in."""
    serial_dir = "/dev/serial/by-id"
    if not os.path.isdir(serial_dir):
        return None
    for entry in os.listdir(serial_dir):
        if CONBEE_SERIAL_PREFIX in entry:
            return {
                "name": entry,
                "path": f"/dev/serial/by-id/{entry}",
                "resolved": os.path.realpath(f"/dev/serial/by-id/{entry}"),
            }
    return None


async def _service_active(name: str) -> bool:
    """Check if a systemd service is active."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "is-active", "--quiet", name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        return proc.returncode == 0
    except Exception:
        return False


@router.get("/status")
async def get_status():
    """Check the overall Zigbee/smart home setup status."""
    conbee = _detect_conbee()
    mosquitto_installed = shutil.which("mosquitto") is not None
    mosquitto_running = await _service_active("mosquitto")
    z2m_installed = os.path.isdir("/opt/zigbee2mqtt")
    z2m_configured = os.path.isfile(Z2M_CONFIG)
    z2m_running = await _service_active("zigbee2mqtt")

    user_in_dialout = False
    try:
        import grp
        dialout = grp.getgrnam("dialout")
        user_in_dialout = os.getlogin() in dialout.gr_mem or os.getgid() == dialout.gr_gid
    except Exception:
        pass

    setup_complete = all([
        conbee is not None,
        mosquitto_running,
        z2m_running,
    ])

    return {
        "setup_complete": setup_complete,
        "conbee": conbee,
        "user_in_dialout": user_in_dialout,
        "mosquitto": {
            "installed": mosquitto_installed,
            "running": mosquitto_running,
        },
        "zigbee2mqtt": {
            "installed": z2m_installed,
            "configured": z2m_configured,
            "running": z2m_running,
        },
    }


@router.get("/devices")
async def list_devices():
    """Return all paired Zigbee devices with their current state."""
    devices = mqtt_client.get_devices()
    states = mqtt_client.get_all_states()
    all_metrics = mqtt_client.get_all_numeric_metrics()
    all_reporting = mqtt_client.get_all_reporting()
    availability = mqtt_client.get_all_availability()

    # Fallback: fill empty MQTT states from the latest DB readings
    db_fallback: dict[str, dict[str, float]] = {}
    empty_names = [d.get("friendly_name", "") for d in devices if not states.get(d.get("friendly_name", ""))]
    if empty_names:
        from .models import SensorReading
        db = _get_db()
        try:
            for name in empty_names:
                readings = (
                    db.query(SensorReading)
                    .filter(SensorReading.device_name == name)
                    .order_by(SensorReading.recorded_at.desc())
                    .limit(20)
                    .all()
                )
                if readings:
                    fallback: dict[str, float] = {}
                    for r in readings:
                        if r.metric not in fallback:
                            fallback[r.metric] = r.value
                    db_fallback[name] = fallback
        finally:
            db.close()

    result = []
    for dev in devices:
        friendly_name = dev.get("friendly_name", "")
        state = states.get(friendly_name, {}) or db_fallback.get(friendly_name, {})

        # Determine availability: prefer MQTT availability topic,
        # fall back to "online" if we have state data, else "offline"
        avail = availability.get(friendly_name, "")
        if not avail or avail == "unknown":
            avail = "online" if state else "offline"

        result.append({
            "ieee_address": dev.get("ieee_address"),
            "friendly_name": friendly_name,
            "type": dev.get("type"),
            "vendor": dev.get("definition", {}).get("vendor", ""),
            "model": dev.get("definition", {}).get("model", ""),
            "description": dev.get("definition", {}).get("description", ""),
            "power_source": dev.get("power_source", ""),
            "supported": dev.get("supported", False),
            "state": state,
            "metrics": all_metrics.get(friendly_name, {}),
            "reporting": all_reporting.get(friendly_name, {}),
            "availability": avail,
        })
    return {"devices": result, "mqtt_connected": mqtt_client.is_connected()}


@router.get("/devices/{friendly_name}")
async def get_device(friendly_name: str):
    """Return state for a specific device."""
    state = mqtt_client.get_device_state(friendly_name)
    if state is None:
        raise HTTPException(status_code=404, detail=f"No state for '{friendly_name}'")
    return {"friendly_name": friendly_name, "state": state}


@router.post("/devices/{friendly_name}/set")
async def set_device(friendly_name: str, payload: dict):
    """Send a command to a device (e.g. {"state": "ON"}, {"brightness": 128})."""
    success = mqtt_client.set_device_state(friendly_name, payload)
    if not success:
        raise HTTPException(status_code=503, detail="MQTT client not connected")
    return {"ok": True, "sent": payload}


# ── Sensor history endpoints ──────────────────────────────────────────────

# Bucket widths to pick from when a range has too many raw rows to return
# as-is. Kept to "nice" calendar-ish units so chart ticks land cleanly.
_BUCKET_LADDER_SECONDS = [60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 12 * 3600, 86400, 7 * 86400, 30 * 86400]


def _pick_bucket_seconds(range_seconds: float, target_points: int) -> int:
    for bucket in _BUCKET_LADDER_SECONDS:
        if range_seconds / bucket <= target_points:
            return bucket
    return _BUCKET_LADDER_SECONDS[-1]


@router.get("/sensors/history")
async def get_sensor_history(
    device: str | None = None,
    metric: str | None = None,
    hours: float = Query(default=24, ge=0.1, le=8760),
    limit: int = Query(default=2000, ge=1, le=50000),
    target_points: int = Query(default=800, ge=50, le=5000, description="Approx. points per metric when bucketing"),
):
    """Get historical sensor readings, filtered by device and/or metric.

    Ranges that fit within `limit` raw rows are returned unchanged. Longer
    ranges (e.g. months/years of minute-by-minute data) are bucketed into
    ~`target_points` averaged points per metric instead, so the query and
    response stay cheap regardless of how far back `hours` reaches.
    """
    from .models import SensorReading

    db = _get_db()
    try:
        since = datetime.now(timezone.utc) - timedelta(hours=hours)

        base_q = db.query(SensorReading).filter(SensorReading.recorded_at >= since)
        if device:
            base_q = base_q.filter(SensorReading.device_name == device)
        if metric:
            base_q = base_q.filter(SensorReading.metric == metric)

        if base_q.count() <= limit:
            q = base_q.order_by(SensorReading.recorded_at.desc()).limit(limit)
            readings = q.all()
            return {"readings": [r.to_json() for r in reversed(readings)], "bucket_seconds": None}

        bucket_seconds = _pick_bucket_seconds(hours * 3600, target_points)
        epoch = cast(func.strftime("%s", SensorReading.recorded_at), Integer)
        bucket_expr = (epoch // bucket_seconds) * bucket_seconds

        rows = (
            base_q
            .with_entities(
                SensorReading.device_name,
                SensorReading.metric,
                bucket_expr.label("bucket"),
                func.avg(SensorReading.value).label("value"),
            )
            .group_by(SensorReading.device_name, SensorReading.metric, "bucket")
            .order_by(SensorReading.metric, "bucket")
            .all()
        )
        readings = [
            {
                "id": int(bucket),
                "device_name": device_name,
                "metric": metric_name,
                "value": float(value),
                "recorded_at": datetime.fromtimestamp(int(bucket), tz=timezone.utc).replace(tzinfo=None).isoformat() + "Z",
            }
            for device_name, metric_name, bucket, value in rows
        ]
        return {"readings": readings, "bucket_seconds": bucket_seconds}
    finally:
        db.close()


@router.get("/sensors/config")
async def get_sensor_configs():
    """Get all sensor recording configurations."""
    from .models import SensorConfig

    db = _get_db()
    try:
        configs = db.query(SensorConfig).all()
        return {"configs": [c.to_json() for c in configs]}
    finally:
        db.close()


@router.put("/sensors/config")
async def set_sensor_config(request: Request):
    """Set recording interval for a sensor/metric pair.

    Body: {"device_name": "...", "metric": "...", "interval_seconds": 60, "enabled": true}
    """
    from .models import SensorConfig

    body = await request.json()
    device_name = body.get("device_name")
    metric = body.get("metric")
    if not device_name or not metric:
        raise HTTPException(status_code=400, detail="device_name and metric required")

    interval = int(body.get("interval_seconds", 60))
    enabled = bool(body.get("enabled", True))

    db = _get_db()
    try:
        existing = db.query(SensorConfig).filter_by(
            device_name=device_name, metric=metric
        ).first()
        if existing:
            existing.interval_seconds = interval
            existing.enabled = 1 if enabled else 0
        else:
            db.add(SensorConfig(
                device_name=device_name,
                metric=metric,
                interval_seconds=interval,
                enabled=1 if enabled else 0,
            ))
        db.commit()
        return {"ok": True, "device_name": device_name, "metric": metric,
                "interval_seconds": interval, "enabled": enabled}
    finally:
        db.close()


@router.delete("/sensors/config/{config_id}")
async def delete_sensor_config(config_id: int):
    """Delete a sensor config entry (reverts to default interval)."""
    from .models import SensorConfig

    db = _get_db()
    try:
        cfg = db.query(SensorConfig).get(config_id)
        if not cfg:
            raise HTTPException(status_code=404, detail="Config not found")
        db.delete(cfg)
        db.commit()
        return {"ok": True}
    finally:
        db.close()
