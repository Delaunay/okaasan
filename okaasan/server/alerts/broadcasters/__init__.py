"""Alert broadcasters — pluggable output channels for alert delivery."""
from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any

log = logging.getLogger("okaasan.alerts.broadcasters")


class Broadcaster(ABC):
    """Base class for alert output channels."""

    @property
    @abstractmethod
    def type_id(self) -> str:
        """Unique type identifier (e.g. 'telegram', 'webhook')."""
        ...

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name shown in UI."""
        ...

    @abstractmethod
    def send(self, config: dict, target: str, message: str, urgency: str) -> bool:
        """Send an alert message.

        Args:
            config: Broadcaster-specific config (bot_token, etc.)
            target: Destination identifier (chat_id, URL, etc.)
            message: Formatted alert text
            urgency: "critical", "warning", or "info"

        Returns:
            True if sent successfully.
        """
        ...

    def validate_config(self, config: dict) -> list[str]:
        """Validate broadcaster config. Return list of error messages (empty = valid)."""
        return []


_broadcaster_types: dict[str, Broadcaster] = {}


def register_type(broadcaster: Broadcaster) -> None:
    _broadcaster_types[broadcaster.type_id] = broadcaster
    log.info("Registered broadcaster type: %s", broadcaster.type_id)


def get_type(type_id: str) -> Broadcaster | None:
    return _broadcaster_types.get(type_id)


def get_all_types() -> dict[str, Broadcaster]:
    return dict(_broadcaster_types)
