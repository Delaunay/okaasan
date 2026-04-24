"""Weather integration using Open-Meteo (free, no API key required).

Geocoding: https://geocoding-api.open-meteo.com/v1/search?name=Montreal
Forecast:  https://api.open-meteo.com/v1/forecast?latitude=...&longitude=...
"""

import traceback

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/weather", tags=["weather"])

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"


def _error_detail(exc: Exception) -> str:
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))


@router.get("/forecast")
def get_forecast(
    latitude: float = Query(..., description="Latitude"),
    longitude: float = Query(..., description="Longitude"),
    days: int = Query(1, ge=1, le=16, description="Number of forecast days"),
):
    """Fetch weather forecast from Open-Meteo."""
    try:
        resp = httpx.get(
            FORECAST_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
                "hourly": "temperature_2m,weather_code,precipitation_probability",
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum",
                "timezone": "auto",
                "forecast_days": days,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))


@router.get("/geocode")
def geocode(
    name: str = Query(..., description="City or place name"),
):
    """Search for a location by name (for getting lat/lon)."""
    try:
        resp = httpx.get(
            GEOCODE_URL,
            params={"name": name, "count": 5, "language": "en", "format": "json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("results", [])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=_error_detail(exc))
