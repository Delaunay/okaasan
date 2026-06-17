"""Metric sources for the alert system.

Each source is a pluggable provider that returns named metrics in a flat dict
keyed by dot-separated paths. The registry auto-discovers all sources.
"""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

log = logging.getLogger("okaasan.alerts.sources")


class MetricSource(ABC):
    """Base class for metric providers."""

    @property
    @abstractmethod
    def source_id(self) -> str:
        """Unique identifier for this source (e.g. 'sensors', 'calendar')."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name shown in the UI."""
        ...

    @abstractmethod
    def collect(self) -> dict[str, Any]:
        """Return all available metrics as {path: value}.

        Paths are relative to this source (e.g. "Garden Moisture.soil_moisture").
        The engine will prefix with `source_id.` to form the full path.
        """
        ...

    def list_metrics(self) -> list[dict[str, str]]:
        """Return metadata about available metrics for the UI picker.

        Each entry: {"path": "device.metric", "label": "Human Name", "unit": "%"}
        Default implementation introspects collect() output.
        """
        metrics = self.collect()
        return [
            {"path": k, "label": k.replace(".", " > "), "unit": ""}
            for k in sorted(metrics.keys())
        ]


_registry: dict[str, MetricSource] = {}


def register(source: MetricSource) -> None:
    """Register a metric source instance."""
    _registry[source.source_id] = source
    log.info("Registered metric source: %s", source.source_id)


def get_all_sources() -> dict[str, MetricSource]:
    return dict(_registry)


def collect_all() -> dict[str, Any]:
    """Collect metrics from all sources, returning full paths."""
    result: dict[str, Any] = {}
    for source_id, source in _registry.items():
        try:
            metrics = source.collect()
            for path, value in metrics.items():
                result[f"{source_id}.{path}"] = value
        except Exception as e:
            log.warning("Failed to collect from source %s: %s", source_id, e)
    return result


def list_all_metrics() -> list[dict]:
    """List all available metrics across all sources."""
    result = []
    for source_id, source in _registry.items():
        try:
            for m in source.list_metrics():
                result.append({
                    "source": source_id,
                    "source_name": source.display_name,
                    "path": m["path"],
                    "full_path": f"{source_id}.{m['path']}",
                    "label": m.get("label", m["path"]),
                    "unit": m.get("unit", ""),
                })
        except Exception as e:
            log.warning("Failed to list metrics from source %s: %s", source_id, e)
    return result
