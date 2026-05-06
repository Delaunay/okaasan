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


def register_integrations(app: "FastAPI", engine: "Engine") -> None:
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
    except Exception as exc:
        log.warning("Google Calendar routes not available: %s", exc)

    # --- Telegram messaging ---
    try:
        from .route_messaging import router as messaging_router

        app.include_router(messaging_router)
    except Exception as exc:
        log.warning("Telegram messaging routes not available: %s", exc)

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
