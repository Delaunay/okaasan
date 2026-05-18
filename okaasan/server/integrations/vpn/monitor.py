"""Background task that monitors VPN connectivity and kills qBittorrent if VPN drops."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from .base import VPNProvider
from ...task_registry import registry

log = logging.getLogger("okaasan.vpn.monitor")

_task: asyncio.Task | None = None
_last_event: dict | None = None


def last_event() -> dict | None:
    """Return the most recent monitor event (VPN drop, qBt killed, etc.)."""
    return _last_event


def is_monitoring() -> bool:
    return _task is not None and not _task.done()


async def _monitor_loop(
    provider: VPNProvider,
    check_interval: float = 10,
) -> None:
    global _last_event

    from ..qbittorrent import process as qbt_process

    consecutive_failures = 0
    was_connected = False

    while True:
        try:
            st = await provider.status()

            if st.connected:
                consecutive_failures = 0
                if not was_connected:
                    _last_event = {
                        "event": "vpn_connected",
                        "message": f"VPN connected to {st.server or st.country or 'server'}",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    log.info("VPN connected: %s (%s)", st.server, st.ip)
                    registry.update("vpn_monitor", status="running", detail=f"Connected to {st.server or st.country or 'server'}")
                was_connected = True
            else:
                consecutive_failures += 1
                log.warning(
                    "VPN disconnected (check %d)", consecutive_failures,
                )

                if consecutive_failures >= 2 and qbt_process.is_running():
                    log.warning(
                        "VPN down for %d consecutive checks — stopping qBittorrent",
                        consecutive_failures,
                    )
                    await qbt_process.stop()
                    _last_event = {
                        "event": "qbt_killed",
                        "message": (
                            f"qBittorrent was stopped because VPN has been disconnected "
                            f"for {consecutive_failures} consecutive checks"
                        ),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    log.warning("qBittorrent stopped due to VPN loss")
                    registry.update("vpn_monitor", status="error", detail="VPN down — qBittorrent stopped")
                elif consecutive_failures >= 2:
                    _last_event = {
                        "event": "vpn_down",
                        "message": "VPN is disconnected",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    }
                    registry.update("vpn_monitor", status="error", detail="VPN disconnected")

                was_connected = False

        except Exception as exc:
            log.error("Monitor error: %s", exc)
            consecutive_failures += 1

        await asyncio.sleep(check_interval)


def start_monitor(provider: VPNProvider, check_interval: float = 10) -> None:
    """Launch the VPN monitor as a background asyncio task."""
    global _task
    if is_monitoring():
        return
    registry.register("vpn_monitor", "VPN Monitor", status="running")
    _task = asyncio.get_event_loop().create_task(
        _monitor_loop(provider, check_interval)
    )
    log.info("VPN monitor started (interval=%ss)", check_interval)


def stop_monitor() -> None:
    """Cancel the monitor task."""
    global _task
    if _task and not _task.done():
        _task.cancel()
        log.info("VPN monitor stopped")
    _task = None
    registry.unregister("vpn_monitor")
