"""Metric source: Smart Home sensors via Zigbee2MQTT."""
from __future__ import annotations

from typing import Any

from . import MetricSource


class SensorMetricSource(MetricSource):
    @property
    def source_id(self) -> str:
        return "sensors"

    @property
    def display_name(self) -> str:
        return "Smart Home Sensors"

    def collect(self) -> dict[str, Any]:
        from ...smarthome import mqtt_client

        states = mqtt_client.get_all_states()
        device_metrics = mqtt_client.get_all_numeric_metrics()
        result: dict[str, Any] = {}

        for device_name, state in states.items():
            if not isinstance(state, dict):
                continue
            allowed = device_metrics.get(device_name, {})
            for metric, value in state.items():
                if metric in allowed and isinstance(value, (int, float)):
                    result[f"{device_name}.{metric}"] = value

        return result

    def list_metrics(self) -> list[dict[str, str]]:
        from ...smarthome import mqtt_client

        device_metrics = mqtt_client.get_all_numeric_metrics()
        result = []
        for device_name, metrics in device_metrics.items():
            for metric_name, unit in metrics.items():
                result.append({
                    "path": f"{device_name}.{metric_name}",
                    "label": f"{device_name} > {metric_name}",
                    "unit": unit,
                })
        return result
