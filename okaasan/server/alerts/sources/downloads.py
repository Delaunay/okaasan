"""Metric source: Torrent downloads via qBittorrent integration."""
from __future__ import annotations

from typing import Any

from . import MetricSource


class DownloadsMetricSource(MetricSource):
    @property
    def source_id(self) -> str:
        return "downloads"

    @property
    def display_name(self) -> str:
        return "Torrent Downloads"

    def collect(self) -> dict[str, Any]:
        try:
            from ...integrations.qbittorrent.client import get_client

            client = get_client()
            if client is None:
                return {}

            torrents = client.torrents_info()
            result: dict[str, Any] = {}
            result["active.count"] = len([t for t in torrents if t.state in ("downloading", "uploading")])
            result["downloading.count"] = len([t for t in torrents if t.state == "downloading"])
            result["seeding.count"] = len([t for t in torrents if t.state == "uploading"])
            result["paused.count"] = len([t for t in torrents if "paused" in t.state.lower()])
            result["total.count"] = len(torrents)

            dl_speed = sum(t.dlspeed for t in torrents)
            up_speed = sum(t.upspeed for t in torrents)
            result["speed.download_bytes"] = dl_speed
            result["speed.upload_bytes"] = up_speed

            for t in torrents:
                name = t.name[:50]
                result[f"{name}.progress"] = round(t.progress * 100, 1)
                result[f"{name}.state"] = t.state

            return result
        except Exception:
            return {}

    def list_metrics(self) -> list[dict[str, str]]:
        return [
            {"path": "active.count", "label": "Active torrents", "unit": ""},
            {"path": "downloading.count", "label": "Downloading count", "unit": ""},
            {"path": "seeding.count", "label": "Seeding count", "unit": ""},
            {"path": "paused.count", "label": "Paused count", "unit": ""},
            {"path": "total.count", "label": "Total torrents", "unit": ""},
            {"path": "speed.download_bytes", "label": "Download speed", "unit": "B/s"},
            {"path": "speed.upload_bytes", "label": "Upload speed", "unit": "B/s"},
        ]
