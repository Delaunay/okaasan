"""Third-party service integrations.

Each sub-module is optional — if the required packages or credentials are
missing the integration is silently skipped and a warning is logged.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI
    from sqlalchemy.engine import Engine

log = logging.getLogger(__name__)


def register_integrations(app: "FastAPI", engine: "Engine", *, private_engine: "Engine | None" = None) -> None:
    """Discover and mount all available integration routers."""

    # --- USDA (FoodData Central API + local CSV) ---
    try:
        from .route_usda import create_usda_router

        usda_router = create_usda_router(engine)
        app.include_router(usda_router)
    except Exception as exc: 
        log.warning("USDA routes not available: %s", exc)

    # --- Google Calendar ---
    try:
        from .route_gcalendar import router as gcalendar_router

        app.include_router(gcalendar_router)

        from .gcalendar import GCalSyncScheduler

        _gcal_scheduler = GCalSyncScheduler(app.state.SessionLocal)

        @app.on_event("startup")
        async def _start_gcal_sync():
            _gcal_scheduler.start()

    except Exception as exc:
        log.warning("Google Calendar routes not available: %s", exc)

    # --- Telegram messaging ---
    try:
        from .route_messaging import router as messaging_router

        app.include_router(messaging_router)
    except Exception as exc:
        log.warning("Telegram messaging routes not available: %s", exc)

    # --- Health data (Garmin Connect + FIT files) ---
    try:
        from ..health.routes import create_health_router

        health_router = create_health_router(private_engine or engine)
        app.include_router(health_router)
    except Exception as exc:
        log.warning("Health data routes not available: %s", exc)

    # --- Garmin (stub) ---
    try:
        from .route_garmin import router as garmin_router

        app.include_router(garmin_router)
    except Exception as exc:
        log.warning("Garmin routes not available: %s", exc)

    # --- Weather (stub) ---
    try:
        from .route_weather import router as weather_router

        app.include_router(weather_router)
    except Exception as exc:
        log.warning("Weather routes not available: %s", exc)

    # --- OCR (receipt scanning) ---
    try:
        from .ocr.route_ocr import router as ocr_router

        app.include_router(ocr_router)
    except Exception as exc:
        log.warning("OCR routes not available: %s", exc)

    # --- qBittorrent (torrent management) ---
    try:
        from .qbittorrent import create_qbittorrent_router

        qbt_router = create_qbittorrent_router(private_engine or engine, engine)
        app.include_router(qbt_router)
    except Exception as exc:
        log.warning("qBittorrent routes not available: %s", exc)

    # --- VPN management ---
    try:
        from .vpn import create_vpn_router

        vpn_router = create_vpn_router()
        app.include_router(vpn_router)
    except Exception as exc:
        log.warning("VPN routes not available: %s", exc)

    # --- Status broadcast (qBittorrent + VPN → WebSocket) ---
    try:
        from .status_broadcast import start as start_broadcast

        @app.on_event("startup")
        async def _start_status_broadcast():
            start_broadcast()
    except Exception as exc:
        log.warning("Status broadcast not available: %s", exc)
