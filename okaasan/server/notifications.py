"""Server-wide WebSocket notification hub.

Provides a singleton ``hub`` that background threads can call
``hub.publish(event)`` on to broadcast JSON events to all connected
WebSocket clients.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from starlette.websockets import WebSocket

log = logging.getLogger("okaasan.notifications")


class NotificationHub:
    def __init__(self):
        self._clients: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._clients.add(ws)
        log.debug("WS client connected (%d total)", len(self._clients))

    def disconnect(self, ws: WebSocket):
        self._clients.discard(ws)
        log.debug("WS client disconnected (%d total)", len(self._clients))

    async def broadcast(self, event: dict[str, Any]):
        if not self._clients:
            return
        data = json.dumps(event)
        dead: list[WebSocket] = []
        for ws in list(self._clients):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._clients.discard(ws)

    def publish(self, event: dict[str, Any]):
        """Thread-safe publish from synchronous code (background threads).

        Schedules the broadcast coroutine on the main asyncio event loop.
        """
        if self._loop is None or self._loop.is_closed():
            log.warning("No event loop available, dropping event: %s", event.get("type"))
            return
        asyncio.run_coroutine_threadsafe(self.broadcast(event), self._loop)


hub = NotificationHub()
