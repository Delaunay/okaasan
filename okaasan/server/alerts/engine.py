"""Alert engine — background thread that evaluates rules against metrics."""
from __future__ import annotations

import json
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from .models import AlertRule, AlertBroadcaster, AlertEvent, AlertDestination
from .sources import collect_all
from .broadcasters import get_type

log = logging.getLogger("okaasan.alerts.engine")


def _evaluate_condition(value: Any, condition: str, threshold: Any) -> bool:
    """Evaluate a single condition against a value."""
    if value is None:
        return False
    try:
        if condition == "gt":
            return float(value) > float(threshold)
        elif condition == "lt":
            return float(value) < float(threshold)
        elif condition == "gte":
            return float(value) >= float(threshold)
        elif condition == "lte":
            return float(value) <= float(threshold)
        elif condition == "eq":
            return value == threshold
        elif condition == "neq":
            return value != threshold
        elif condition == "contains":
            return str(threshold) in str(value)
    except (TypeError, ValueError):
        return False
    return False


def _format_message(rule: AlertRule, value: Any) -> str:
    """Format the alert message text."""
    urgency_label = rule.urgency.upper()
    return (
        f"<b>[{urgency_label}] {rule.name}</b>\n"
        f"Metric: <code>{rule.source}.{rule.metric_path}</code>\n"
        f"Value: <b>{value}</b> (threshold: {rule.condition} {json.loads(rule.threshold)})"
    )


class AlertEngine:
    """Background thread that periodically evaluates alert rules."""

    def __init__(self, session_factory: sessionmaker, check_interval: float = 30.0):
        self._session_factory = session_factory
        self._check_interval = check_interval
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="alert-engine", daemon=True)
        self._thread.start()
        log.info("Alert engine started (check every %.0fs)", self._check_interval)

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        log.info("Alert engine stopped")

    def _run(self) -> None:
        time.sleep(10)  # let other services initialize first
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as e:
                log.error("Alert engine tick failed: %s", e, exc_info=True)
            self._stop_event.wait(self._check_interval)

    def _tick(self) -> None:
        metrics = collect_all()
        if not metrics:
            return

        session: Session = self._session_factory()
        try:
            rules = session.query(AlertRule).filter(AlertRule.enabled == 1).all()
            if not rules:
                return

            now = datetime.now(timezone.utc)

            for rule in rules:
                full_path = f"{rule.source}.{rule.metric_path}"
                value = metrics.get(full_path)

                threshold = json.loads(rule.threshold) if rule.threshold else None
                condition_met = _evaluate_condition(value, rule.condition, threshold)

                active_event = (
                    session.query(AlertEvent)
                    .filter(
                        AlertEvent.rule_id == rule.id,
                        AlertEvent.status == "active",
                    )
                    .first()
                )

                if condition_met:
                    self._handle_triggered(session, rule, value, active_event, now)
                else:
                    self._handle_clear(session, rule, active_event, now)

            session.commit()
        finally:
            session.close()

    def _handle_triggered(
        self,
        session: Session,
        rule: AlertRule,
        value: Any,
        active_event: AlertEvent | None,
        now: datetime,
    ) -> None:
        """Rule condition is met — decide whether to fire/re-fire."""
        if active_event:
            if rule.urgency == "info":
                return

            elapsed = (now - active_event.fired_at).total_seconds()
            if rule.cooldown_seconds > 0 and elapsed < rule.cooldown_seconds:
                return

            if rule.urgency == "critical":
                self._fire_alert(session, rule, value, now)
            elif rule.urgency == "warning":
                self._fire_alert(session, rule, value, now)
        else:
            self._fire_alert(session, rule, value, now)
            event = AlertEvent(
                rule_id=rule.id,
                fired_at=now,
                value_snapshot=json.dumps(value),
                message=_format_message(rule, value),
                status="active",
            )
            session.add(event)

    def _handle_clear(
        self,
        session: Session,
        rule: AlertRule,
        active_event: AlertEvent | None,
        now: datetime,
    ) -> None:
        """Rule condition no longer met — resolve if configured."""
        if active_event and rule.resolve_on_clear:
            active_event.status = "resolved"
            active_event.resolved_at = now

    def _fire_alert(
        self, session: Session, rule: AlertRule, value: Any, now: datetime
    ) -> None:
        """Send alert through all configured broadcasters."""
        broadcaster_ids = json.loads(rule.broadcaster_ids) if rule.broadcaster_ids else []
        if not broadcaster_ids:
            return

        message = _format_message(rule, value)

        broadcasters = (
            session.query(AlertBroadcaster)
            .filter(
                AlertBroadcaster.id.in_(broadcaster_ids),
                AlertBroadcaster.enabled == 1,
            )
            .all()
        )

        for bc in broadcasters:
            impl = get_type(bc.type)
            if not impl:
                log.warning("No broadcaster implementation for type '%s'", bc.type)
                continue

            config = bc.get_config()

            destinations = (
                session.query(AlertDestination)
                .filter(AlertDestination.broadcaster_id == bc.id)
                .all()
            )

            if destinations:
                for dest in destinations:
                    impl.send(config, dest.target, message, rule.urgency)
            else:
                # Fall back to default target in config
                default_target = config.get("chat_id", "")
                if default_target:
                    impl.send(config, default_target, message, rule.urgency)
