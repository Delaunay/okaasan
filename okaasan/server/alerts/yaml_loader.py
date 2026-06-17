"""Load alert rules and broadcasters from a YAML config file.

Supports seeding initial configuration and syncing from a YAML file
at `uploads/data/_config/_alerts.yaml`.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from sqlalchemy.orm import Session, sessionmaker

from .models import AlertRule, AlertBroadcaster, AlertDestination

log = logging.getLogger("okaasan.alerts.yaml_loader")


def load_yaml_config(config_path: Path, session_factory: sessionmaker) -> None:
    """Load alert config from YAML file if it exists.

    Rules and broadcasters defined in the YAML file are synced to the DB
    using the `name` field as the unique key. Existing DB entries not in
    the YAML are left untouched (DB is additive, YAML seeds/updates only).
    """
    if not config_path.is_file():
        return

    try:
        import yaml
    except ImportError:
        log.warning("PyYAML not installed — skipping YAML alert config loading")
        return

    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
    except Exception as e:
        log.error("Failed to parse alerts YAML: %s", e)
        return

    if not config or not isinstance(config, dict):
        return

    session: Session = session_factory()
    try:
        _sync_broadcasters(session, config.get("broadcasters", []))
        _sync_rules(session, config.get("rules", []))
        session.commit()
        log.info("Alert YAML config loaded from %s", config_path)
    except Exception as e:
        session.rollback()
        log.error("Failed to apply YAML alert config: %s", e)
    finally:
        session.close()


def _sync_broadcasters(session: Session, broadcasters: list) -> None:
    for bc_data in broadcasters:
        name = bc_data.get("name")
        if not name:
            continue

        existing = session.query(AlertBroadcaster).filter(AlertBroadcaster.name == name).first()
        if existing:
            existing.type = bc_data.get("type", existing.type)
            if "config" in bc_data:
                existing.config = json.dumps(bc_data["config"])
            if "enabled" in bc_data:
                existing.enabled = int(bc_data["enabled"])
        else:
            bc = AlertBroadcaster(
                name=name,
                type=bc_data.get("type", "telegram"),
                config=json.dumps(bc_data.get("config", {})),
                enabled=int(bc_data.get("enabled", True)),
            )
            session.add(bc)
            session.flush()

            for dest in bc_data.get("destinations", []):
                d = AlertDestination(
                    broadcaster_id=bc.id,
                    label=dest.get("label", name),
                    target=dest["target"],
                )
                session.add(d)


def _sync_rules(session: Session, rules: list) -> None:
    for rule_data in rules:
        name = rule_data.get("name")
        if not name:
            continue

        existing = session.query(AlertRule).filter(AlertRule.name == name).first()

        # Resolve broadcaster names to IDs
        bc_names = rule_data.get("broadcasters", [])
        bc_ids = []
        if bc_names:
            bcs = session.query(AlertBroadcaster).filter(AlertBroadcaster.name.in_(bc_names)).all()
            bc_ids = [bc.id for bc in bcs]

        if existing:
            if "source" in rule_data:
                existing.source = rule_data["source"]
            if "metric_path" in rule_data:
                existing.metric_path = rule_data["metric_path"]
            if "condition" in rule_data:
                existing.condition = rule_data["condition"]
            if "threshold" in rule_data:
                existing.threshold = json.dumps(rule_data["threshold"])
            if "urgency" in rule_data:
                existing.urgency = rule_data["urgency"]
            if "cooldown_seconds" in rule_data:
                existing.cooldown_seconds = rule_data["cooldown_seconds"]
            if "resolve_on_clear" in rule_data:
                existing.resolve_on_clear = int(rule_data["resolve_on_clear"])
            if "enabled" in rule_data:
                existing.enabled = int(rule_data["enabled"])
            if bc_ids:
                existing.broadcaster_ids = json.dumps(bc_ids)
        else:
            rule = AlertRule(
                name=name,
                enabled=int(rule_data.get("enabled", True)),
                source=rule_data.get("source", ""),
                metric_path=rule_data.get("metric_path", ""),
                condition=rule_data.get("condition", "gt"),
                threshold=json.dumps(rule_data.get("threshold", 0)),
                urgency=rule_data.get("urgency", "info"),
                cooldown_seconds=rule_data.get("cooldown_seconds", 3600),
                resolve_on_clear=int(rule_data.get("resolve_on_clear", True)),
                broadcaster_ids=json.dumps(bc_ids),
            )
            session.add(rule)
