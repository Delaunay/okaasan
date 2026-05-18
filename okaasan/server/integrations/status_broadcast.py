"""Background loop that broadcasts qBittorrent + VPN status over WebSocket."""
from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict

from ..notifications import hub
from ..task_registry import registry

log = logging.getLogger("okaasan.status_broadcast")

_task: asyncio.Task | None = None

INTERVAL_SECONDS = 4


async def _broadcast_loop() -> None:
    from .qbittorrent import process as qbt_process
    from .qbittorrent.routes import _get_client
    from .vpn.routes import _get_provider
    from .vpn import monitor as vpn_monitor

    while True:
        try:
            event = await _gather(qbt_process, _get_client, _get_provider, vpn_monitor)
            await hub.broadcast(event)
        except Exception:
            log.debug("status broadcast tick failed", exc_info=True)

        await asyncio.sleep(INTERVAL_SECONDS)


async def _gather(qbt_process, get_client, get_provider, vpn_monitor) -> dict:
    # ── qBittorrent ──────────────────────────────────────────────
    proc = qbt_process.status()
    transfer = None
    version = None
    connection_error = None
    torrents: list[dict] = []

    if proc["running"]:
        client = get_client()
        try:
            if client.is_connected():
                transfer = client.get_transfer_info()
                version = client.get_version()
                torrents = client.list_torrents()
        except Exception as e:
            connection_error = str(e)

    qbt = {
        "process": proc,
        "connected": transfer is not None,
        "transfer": transfer,
        "version": version,
        "connection_error": connection_error,
    }

    # ── VPN ──────────────────────────────────────────────────────
    vpn: dict
    try:
        provider = get_provider()
        st = await provider.status()
        vpn = {
            "connected": st.connected,
            "server": st.server,
            "country": st.country,
            "city": st.city,
            "ip": st.ip,
            "protocol": st.protocol,
            "load": st.load,
            "interface": st.interface,
            "provider": provider.name,
            "monitor_active": vpn_monitor.is_monitoring(),
            "last_event": vpn_monitor.last_event(),
        }
    except Exception as e:
        vpn = {
            "connected": False,
            "error": str(e),
            "provider": "unknown",
            "monitor_active": vpn_monitor.is_monitoring(),
            "last_event": vpn_monitor.last_event(),
        }

    return {
        "type": "downloads_status",
        "qbt": qbt,
        "vpn": vpn,
        "torrents": torrents,
    }


def start() -> None:
    """Start the broadcast loop as a background asyncio task."""
    global _task
    if _task is not None and not _task.done():
        return
    registry.register("status_broadcast", "Downloads Monitor", status="running")
    _task = asyncio.get_event_loop().create_task(_broadcast_loop())
    log.info("Status broadcast started (interval=%ds)", INTERVAL_SECONDS)


def stop() -> None:
    """Cancel the broadcast loop."""
    global _task
    if _task and not _task.done():
        _task.cancel()
        log.info("Status broadcast stopped")
    _task = None
    registry.unregister("status_broadcast")
