"""Background MQTT client that subscribes to zigbee2mqtt and caches device state."""
from __future__ import annotations

import json
import logging
import threading
from typing import Any

import paho.mqtt.client as mqtt

log = logging.getLogger("okaasan.smarthome.mqtt")

_client: mqtt.Client | None = None
_devices: dict[str, dict[str, Any]] = {}
_device_states: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()

BRIDGE_DEVICES_TOPIC = "zigbee2mqtt/bridge/devices"
BRIDGE_STATE_TOPIC = "zigbee2mqtt/bridge/state"
BASE_TOPIC = "zigbee2mqtt"


def get_devices() -> list[dict[str, Any]]:
    with _lock:
        return list(_devices.values())


def get_device_numeric_metrics(friendly_name: str) -> dict[str, str]:
    """Return {metric_name: unit} for all numeric exposes of a device."""
    with _lock:
        dev = _devices.get(friendly_name)
    if not dev:
        return {}
    return _extract_numeric_exposes(dev.get("definition", {}))


def get_all_numeric_metrics() -> dict[str, dict[str, str]]:
    """Return {friendly_name: {metric_name: unit}} for all devices."""
    with _lock:
        devices = list(_devices.values())
    result = {}
    for dev in devices:
        metrics = _extract_numeric_exposes(dev.get("definition", {}))
        if metrics:
            result[dev["friendly_name"]] = metrics
    return result


def _extract_numeric_exposes(definition: dict) -> dict[str, str]:
    """Walk the exposes tree and return all numeric properties with their units."""
    metrics: dict[str, str] = {}
    for expose in definition.get("exposes", []):
        _collect_numeric(expose, metrics)
    return metrics


def _collect_numeric(expose: dict, out: dict[str, str]) -> None:
    if expose.get("type") == "numeric":
        name = expose.get("property") or expose.get("name")
        if name:
            out[name] = expose.get("unit", "")
    # Some exposes have nested features (e.g. composite types like "light")
    for feature in expose.get("features", []):
        _collect_numeric(feature, out)


# Mapping from Zigbee cluster names to metric property names
_CLUSTER_TO_METRIC: dict[str, str] = {
    "msTemperatureMeasurement": "temperature",
    "msRelativeHumidity": "humidity",
    "msSoilMoisture": "soil_moisture",
    "msIlluminanceMeasurement": "illuminance",
    "msPressureMeasurement": "pressure",
    "genPowerCfg": "battery",
    "seMetering": "energy",
    "haElectricalMeasurement": "power",
}


def get_device_reporting(friendly_name: str) -> dict[str, dict[str, int]]:
    """Return reporting intervals for a device: {metric: {min_interval, max_interval, reportable_change}}."""
    with _lock:
        dev = _devices.get(friendly_name)
    if not dev:
        return {}
    return _extract_reporting(dev)


def get_all_reporting() -> dict[str, dict[str, dict[str, int]]]:
    """Return {friendly_name: {metric: {min_interval, max_interval, reportable_change}}} for all devices."""
    with _lock:
        devices = list(_devices.values())
    result = {}
    for dev in devices:
        reporting = _extract_reporting(dev)
        if reporting:
            result[dev["friendly_name"]] = reporting
    return result


def _extract_reporting(dev: dict) -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for ep in dev.get("endpoints", {}).values():
        for r in ep.get("configured_reportings", []):
            cluster = r.get("cluster", "")
            metric = _CLUSTER_TO_METRIC.get(cluster)
            if metric:
                result[metric] = {
                    "min_interval": r.get("minimum_report_interval", 0),
                    "max_interval": r.get("maximum_report_interval", 0),
                    "reportable_change": r.get("reportable_change", 0),
                }
    return result


def get_device_state(friendly_name: str) -> dict[str, Any] | None:
    with _lock:
        return _device_states.get(friendly_name)


def get_all_states() -> dict[str, dict[str, Any]]:
    with _lock:
        return dict(_device_states)


def publish(topic: str, payload: dict | str) -> bool:
    if _client is None or not _client.is_connected():
        return False
    msg = json.dumps(payload) if isinstance(payload, dict) else payload
    _client.publish(topic, msg)
    return True


def set_device_state(friendly_name: str, state: dict[str, Any]) -> bool:
    topic = f"{BASE_TOPIC}/{friendly_name}/set"
    return publish(topic, state)


def _on_connect(client: mqtt.Client, userdata: Any, flags: Any, rc: int, properties: Any = None) -> None:
    if rc == 0:
        log.info("Connected to MQTT broker")
        client.subscribe(f"{BASE_TOPIC}/#")
    else:
        log.error("MQTT connection failed with code %d", rc)


def _on_message(client: mqtt.Client, userdata: Any, msg: mqtt.MQTTMessage) -> None:
    topic = msg.topic
    try:
        payload = json.loads(msg.payload.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return

    if topic == BRIDGE_DEVICES_TOPIC:
        with _lock:
            _devices.clear()
            for dev in payload:
                if dev.get("type") in ("EndDevice", "Router"):
                    _devices[dev["friendly_name"]] = dev
        log.info("Received %d devices from bridge", len(_devices))
        return

    if topic == BRIDGE_STATE_TOPIC:
        return

    if topic.startswith(f"{BASE_TOPIC}/bridge/"):
        return

    # Device state update: zigbee2mqtt/<friendly_name>
    parts = topic.split("/")
    if len(parts) == 2 and parts[0] == BASE_TOPIC:
        friendly_name = parts[1]
        if isinstance(payload, dict):
            with _lock:
                _device_states[friendly_name] = payload
        return


def start(host: str = "localhost", port: int = 1883) -> None:
    global _client
    if _client is not None:
        return

    _client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    _client.on_connect = _on_connect
    _client.on_message = _on_message

    try:
        _client.connect(host, port, keepalive=60)
        _client.loop_start()
        log.info("MQTT client started (broker=%s:%d)", host, port)
    except Exception as e:
        log.error("Failed to connect to MQTT broker: %s", e)
        _client = None


def stop() -> None:
    global _client
    if _client:
        _client.loop_stop()
        _client.disconnect()
        _client = None
        log.info("MQTT client stopped")


def is_connected() -> bool:
    return _client is not None and _client.is_connected()
