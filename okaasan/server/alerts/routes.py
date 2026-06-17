"""Alert system API routes."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Query

from .models import AlertRule, AlertBroadcaster, AlertEvent, AlertDestination
from .sources import list_all_metrics
from .broadcasters import get_type, get_all_types

log = logging.getLogger("okaasan.alerts.routes")

router = APIRouter(prefix="/alerts", tags=["alerts"])

_SessionLocal = None  # injected at startup


def _get_db():
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Rules CRUD ─────────────────────────────────────────────


@router.get("/rules")
def list_rules(request: Request):
    db = next(_get_db())
    try:
        rules = db.query(AlertRule).order_by(AlertRule.created_at.desc()).all()
        # Attach last event info
        result = []
        for rule in rules:
            data = rule.to_json()
            last_event = (
                db.query(AlertEvent)
                .filter(AlertEvent.rule_id == rule.id)
                .order_by(AlertEvent.fired_at.desc())
                .first()
            )
            data["last_event"] = last_event.to_json() if last_event else None
            result.append(data)
        return result
    finally:
        db.close()


@router.post("/rules", status_code=201)
async def create_rule(request: Request):
    data = await request.json()
    db = next(_get_db())
    try:
        rule = AlertRule(
            name=data["name"],
            enabled=int(data.get("enabled", True)),
            source=data["source"],
            metric_path=data["metric_path"],
            condition=data["condition"],
            threshold=json.dumps(data["threshold"]),
            urgency=data.get("urgency", "info"),
            cooldown_seconds=data.get("cooldown_seconds", 3600),
            resolve_on_clear=int(data.get("resolve_on_clear", True)),
            broadcaster_ids=json.dumps(data.get("broadcaster_ids", [])),
        )
        db.add(rule)
        db.commit()
        db.refresh(rule)
        return rule.to_json()
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing field: {e}")
    finally:
        db.close()


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: int, request: Request):
    data = await request.json()
    db = next(_get_db())
    try:
        rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")

        if "name" in data:
            rule.name = data["name"]
        if "enabled" in data:
            rule.enabled = int(data["enabled"])
        if "source" in data:
            rule.source = data["source"]
        if "metric_path" in data:
            rule.metric_path = data["metric_path"]
        if "condition" in data:
            rule.condition = data["condition"]
        if "threshold" in data:
            rule.threshold = json.dumps(data["threshold"])
        if "urgency" in data:
            rule.urgency = data["urgency"]
        if "cooldown_seconds" in data:
            rule.cooldown_seconds = data["cooldown_seconds"]
        if "resolve_on_clear" in data:
            rule.resolve_on_clear = int(data["resolve_on_clear"])
        if "broadcaster_ids" in data:
            rule.broadcaster_ids = json.dumps(data["broadcaster_ids"])

        rule.updated_at = datetime.now(timezone.utc)
        db.commit()
        return rule.to_json()
    finally:
        db.close()


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int):
    db = next(_get_db())
    try:
        rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
        if not rule:
            raise HTTPException(status_code=404, detail="Rule not found")
        db.delete(rule)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Broadcasters CRUD ─────────────────────────────────────


@router.get("/broadcasters")
def list_broadcasters():
    db = next(_get_db())
    try:
        bcs = db.query(AlertBroadcaster).all()
        result = []
        for bc in bcs:
            data = bc.to_json()
            dests = (
                db.query(AlertDestination)
                .filter(AlertDestination.broadcaster_id == bc.id)
                .all()
            )
            data["destinations"] = [d.to_json() for d in dests]
            result.append(data)
        return result
    finally:
        db.close()


@router.post("/broadcasters", status_code=201)
async def create_broadcaster(request: Request):
    data = await request.json()
    db = next(_get_db())
    try:
        bc = AlertBroadcaster(
            name=data["name"],
            type=data["type"],
            config=json.dumps(data.get("config", {})),
            enabled=int(data.get("enabled", True)),
        )
        db.add(bc)
        db.commit()
        db.refresh(bc)

        # Create destinations if provided
        for dest in data.get("destinations", []):
            d = AlertDestination(
                broadcaster_id=bc.id,
                label=dest["label"],
                target=dest["target"],
            )
            db.add(d)
        db.commit()

        return bc.to_json()
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing field: {e}")
    finally:
        db.close()


@router.put("/broadcasters/{broadcaster_id}")
async def update_broadcaster(broadcaster_id: int, request: Request):
    data = await request.json()
    db = next(_get_db())
    try:
        bc = db.query(AlertBroadcaster).filter(AlertBroadcaster.id == broadcaster_id).first()
        if not bc:
            raise HTTPException(status_code=404, detail="Broadcaster not found")

        if "name" in data:
            bc.name = data["name"]
        if "type" in data:
            bc.type = data["type"]
        if "config" in data:
            bc.config = json.dumps(data["config"])
        if "enabled" in data:
            bc.enabled = int(data["enabled"])

        db.commit()
        return bc.to_json()
    finally:
        db.close()


@router.delete("/broadcasters/{broadcaster_id}")
def delete_broadcaster(broadcaster_id: int):
    db = next(_get_db())
    try:
        bc = db.query(AlertBroadcaster).filter(AlertBroadcaster.id == broadcaster_id).first()
        if not bc:
            raise HTTPException(status_code=404, detail="Broadcaster not found")
        # Remove destinations
        db.query(AlertDestination).filter(AlertDestination.broadcaster_id == bc.id).delete()
        db.delete(bc)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/broadcasters/{broadcaster_id}/test")
async def test_broadcaster(broadcaster_id: int, request: Request):
    """Send a test message through a broadcaster."""
    db = next(_get_db())
    try:
        bc = db.query(AlertBroadcaster).filter(AlertBroadcaster.id == broadcaster_id).first()
        if not bc:
            raise HTTPException(status_code=404, detail="Broadcaster not found")

        impl = get_type(bc.type)
        if not impl:
            raise HTTPException(status_code=400, detail=f"Unknown broadcaster type: {bc.type}")

        config = bc.get_config()
        target = config.get("chat_id", "")

        # Allow override target from request body
        body = await request.json() if request.headers.get("content-type") == "application/json" else {}
        if body.get("target"):
            target = body["target"]

        if not target:
            raise HTTPException(status_code=400, detail="No target specified")

        message = "This is a test alert from Okaasan Alert System."
        success = impl.send(config, target, message, "info")

        if success:
            return {"ok": True, "message": "Test message sent"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send test message")
    finally:
        db.close()


# ── Destinations CRUD ─────────────────────────────────────


@router.post("/broadcasters/{broadcaster_id}/destinations", status_code=201)
async def add_destination(broadcaster_id: int, request: Request):
    data = await request.json()
    db = next(_get_db())
    try:
        bc = db.query(AlertBroadcaster).filter(AlertBroadcaster.id == broadcaster_id).first()
        if not bc:
            raise HTTPException(status_code=404, detail="Broadcaster not found")
        dest = AlertDestination(
            broadcaster_id=broadcaster_id,
            label=data["label"],
            target=data["target"],
        )
        db.add(dest)
        db.commit()
        db.refresh(dest)
        return dest.to_json()
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Missing field: {e}")
    finally:
        db.close()


@router.delete("/destinations/{destination_id}")
def delete_destination(destination_id: int):
    db = next(_get_db())
    try:
        dest = db.query(AlertDestination).filter(AlertDestination.id == destination_id).first()
        if not dest:
            raise HTTPException(status_code=404, detail="Destination not found")
        db.delete(dest)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Events ─────────────────────────────────────────────────


@router.get("/events")
def list_events(
    status: str = Query(None),
    rule_id: int = Query(None),
    limit: int = Query(50, ge=1, le=500),
):
    db = next(_get_db())
    try:
        q = db.query(AlertEvent).order_by(AlertEvent.fired_at.desc())
        if status:
            q = q.filter(AlertEvent.status == status)
        if rule_id:
            q = q.filter(AlertEvent.rule_id == rule_id)
        events = q.limit(limit).all()
        return [e.to_json() for e in events]
    finally:
        db.close()


@router.post("/events/{event_id}/acknowledge")
def acknowledge_event(event_id: int):
    db = next(_get_db())
    try:
        event = db.query(AlertEvent).filter(AlertEvent.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        event.status = "acknowledged"
        event.resolved_at = datetime.now(timezone.utc)
        db.commit()
        return event.to_json()
    finally:
        db.close()


# ── Sources ────────────────────────────────────────────────


@router.get("/sources")
def list_sources():
    """List all available metric sources and their metric paths."""
    return list_all_metrics()


@router.get("/broadcaster-types")
def list_broadcaster_types():
    """List available broadcaster type implementations."""
    types = get_all_types()
    return [
        {"type_id": t.type_id, "display_name": t.display_name}
        for t in types.values()
    ]
