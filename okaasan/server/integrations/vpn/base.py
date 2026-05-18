"""Abstract base for VPN providers."""
from __future__ import annotations

import abc
from dataclasses import dataclass, field


@dataclass
class VPNStatus:
    connected: bool = False
    server: str | None = None
    country: str | None = None
    city: str | None = None
    ip: str | None = None
    protocol: str | None = None
    load: str | None = None
    interface: str | None = None
    extra: dict = field(default_factory=dict)


class VPNProvider(abc.ABC):
    """Interface every VPN provider must implement."""

    name: str = "generic"

    @abc.abstractmethod
    async def connect(
        self,
        *,
        country: str | None = None,
        city: str | None = None,
        server: str | None = None,
        p2p: bool = False,
    ) -> str:
        """Establish a VPN connection. Returns a human-readable message."""

    @abc.abstractmethod
    async def disconnect(self) -> str:
        """Tear down the VPN connection."""

    @abc.abstractmethod
    async def status(self) -> VPNStatus:
        """Return the current connection status."""

    @abc.abstractmethod
    async def countries(self) -> list[dict]:
        """List available countries / regions."""

    def detect_interface(self) -> str | None:
        """Return the tun/wg interface name when connected, or None."""
        return None
