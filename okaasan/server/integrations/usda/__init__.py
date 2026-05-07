"""USDA FoodData Central integration.

Provides a shared FDC API client singleton and helpers for fetching
nutrient data from the USDA API.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any
from urllib.parse import urljoin

log = logging.getLogger("okaasan.usda")

_fdc_client = None
_fdc_initialized = False


def get_fdc_client():
    """Return the shared FDC API client (lazy-initialized, rate-limited).

    Returns None if the usda_fdc package isn't installed or FDC_API_KEY is not set.
    """
    global _fdc_client, _fdc_initialized

    if _fdc_initialized:
        return _fdc_client

    _fdc_initialized = True

    try:
        from usda_fdc.client import FdcClient

        class RateLimitedClient(FdcClient):
            REQUEST_TIMEOUT = 15  # seconds

            def __init__(self, api_key, requests_per_minute=30, **kwargs):
                super().__init__(api_key, **kwargs)
                self.requests_per_minute = requests_per_minute
                self.interval = 60.0 / requests_per_minute
                self.last_request_time = 0.0
                self.session.timeout = self.REQUEST_TIMEOUT

            def _make_request(self, endpoint, method="GET", params=None, data=None):
                current_time = time.time()
                time_since_last = current_time - self.last_request_time
                if time_since_last < self.interval:
                    wait = self.interval - time_since_last
                    log.warning("FDC rate-limit: sleeping %.2fs before %s %s", wait, method, endpoint)
                    time.sleep(wait)

                t0 = time.monotonic()
                log.warning("FDC API >>> %s %s", method, endpoint)

                url = urljoin(self.base_url, endpoint)
                params = params or {}
                params["api_key"] = self.api_key

                try:
                    response = self.session.request(
                        method=method,
                        url=url,
                        params=params,
                        json=data,
                        timeout=self.REQUEST_TIMEOUT,
                    )
                    response.raise_for_status()
                    result = response.json()
                except Exception as exc:
                    elapsed = time.monotonic() - t0
                    log.error("FDC API !!! %s %s failed after %.2fs: %s", method, endpoint, elapsed, exc)
                    raise

                elapsed = time.monotonic() - t0
                log.warning("FDC API <<< %s %s completed in %.2fs", method, endpoint, elapsed)
                self.last_request_time = time.time()
                return result

        api_key = os.getenv("FDC_API_KEY")
        if api_key:
            _fdc_client = RateLimitedClient(api_key)
            log.warning("FDC API client initialized (timeout=%ds)", RateLimitedClient.REQUEST_TIMEOUT)
        else:
            log.warning("FDC_API_KEY not set; FDC API features disabled")

    except (ImportError, ModuleNotFoundError) as exc:
        log.warning("usda_fdc package not available: %s", exc)
    except Exception as exc:
        log.warning("Failed to initialize FDC client: %s", exc)

    return _fdc_client


import re

_PAREN_RE = re.compile(r"\s*\([^)]*\)\s*")

_NUTRIENT_MAP: dict[str, tuple[str, str]] = {
    "energy": ("Calories", ""),
    "total lipid (fat)": ("Fat", ""),
    "total lipid": ("Fat", ""),
    "fat": ("Fat", ""),
    "total fat": ("Fat", ""),
    "fatty acids, total saturated": ("Fat", "Saturated"),
    "fatty acids, total monounsaturated": ("Fat", "Monounsaturated"),
    "fatty acids, total polyunsaturated": ("Fat", "Polyunsaturated"),
    "fatty acids, total trans": ("Fat", "Trans"),
    "fatty acids, total trans-monoenoic": ("Fat", "Trans"),
    "carbohydrate, by difference": ("Carbohydrate", ""),
    "carbohydrate": ("Carbohydrate", ""),
    "total carbohydrate": ("Carbohydrate", ""),
    "fiber, total dietary": ("Carbohydrate", "Fiber"),
    "sugars, total including nlea": ("Carbohydrate", "Sugars"),
    "sugars, total": ("Carbohydrate", "Sugars"),
    "sugars": ("Carbohydrate", "Sugars"),
    "total sugars": ("Carbohydrate", "Sugars"),
    "fiber": ("Carbohydrate", "Fiber"),
    "dietary fiber": ("Carbohydrate", "Fiber"),
    "protein": ("Protein", ""),
    "cholesterol": ("Cholesterol", ""),
    "saturated": ("Fat", "Saturated"),
    "monounsaturated": ("Fat", "Monounsaturated"),
    "polyunsaturated": ("Fat", "Polyunsaturated"),
    "trans": ("Fat", "Trans"),
    "sodium, na": ("Mineral", "Sodium"),
    "sodium": ("Mineral", "Sodium"),
    "calcium, ca": ("Mineral", "Calcium"),
    "calcium": ("Mineral", "Calcium"),
    "iron, fe": ("Mineral", "Iron"),
    "iron": ("Mineral", "Iron"),
    "magnesium, mg": ("Mineral", "Magnesium"),
    "magnesium": ("Mineral", "Magnesium"),
    "phosphorus, p": ("Mineral", "Phosphorus"),
    "phosphorus": ("Mineral", "Phosphorus"),
    "potassium, k": ("Mineral", "Potassium"),
    "potassium": ("Mineral", "Potassium"),
    "zinc, zn": ("Mineral", "Zinc"),
    "zinc": ("Mineral", "Zinc"),
    "copper, cu": ("Mineral", "Copper"),
    "copper": ("Mineral", "Copper"),
    "manganese, mn": ("Mineral", "Manganese"),
    "manganese": ("Mineral", "Manganese"),
    "selenium, se": ("Mineral", "Selenium"),
    "selenium": ("Mineral", "Selenium"),
    "molybdenum, mo": ("Mineral", "Molybdenum"),
    "molybdenum": ("Mineral", "Molybdenum"),
    "thiamin": ("Vitamin", "B1"),
    "riboflavin": ("Vitamin", "B2"),
    "niacin": ("Vitamin", "B3"),
    "pantothenic acid": ("Vitamin", "B5"),
    "vitamin b-6": ("Vitamin", "B6"),
    "vitamin b-12": ("Vitamin", "B12"),
    "b1": ("Vitamin", "B1"),
    "b2": ("Vitamin", "B2"),
    "b3": ("Vitamin", "B3"),
    "b5": ("Vitamin", "B5"),
    "b6": ("Vitamin", "B6"),
    "b12": ("Vitamin", "B12"),
    "folate, total": ("Vitamin", "Folate"),
    "folate": ("Vitamin", "Folate"),
    "folic acid": ("Vitamin", "Folate"),
    "vitamin a, rae": ("Vitamin", "A"),
    "vitamin a": ("Vitamin", "A"),
    "vitamin c, total ascorbic acid": ("Vitamin", "C"),
    "vitamin c": ("Vitamin", "C"),
    "vitamin d (d2 + d3)": ("Vitamin", "D"),
    "vitamin d": ("Vitamin", "D"),
    "vitamin e (alpha-tocopherol)": ("Vitamin", "E"),
    "vitamin e": ("Vitamin", "E"),
    "vitamin k (phylloquinone)": ("Vitamin", "K"),
    "vitamin k": ("Vitamin", "K"),
    "water": ("Others", "Water"),
    "ash": ("Others", "Ash"),
    "nitrogen": ("Others", "Nitrogen"),
}


def normalize_nutrient_name(raw_name: str, unit: str = "") -> tuple[str, str]:
    """Map a raw USDA nutrient name to a (kind, name) tuple.

    Returns generic short names suitable for display and aggregation.
    """
    lower = raw_name.strip().lower()

    # Energy is duplicated in kJ and kcal — only keep kcal
    if lower == "energy" and unit.upper() == "KJ":
        return ("_skip", "")

    # Direct lookup
    if lower in _NUTRIENT_MAP:
        return _NUTRIENT_MAP[lower]

    # Try stripping parenthetical qualifiers then looking up
    stripped = _PAREN_RE.sub("", lower).strip()
    if stripped in _NUTRIENT_MAP:
        return _NUTRIENT_MAP[stripped]

    # Pattern-based detection
    if lower.startswith("vitamin"):
        clean = _PAREN_RE.sub("", raw_name).strip()
        clean = clean.replace("-", "").replace("Vitamin ", "").replace("vitamin ", "")
        return ("Vitamin", clean.strip().capitalize())

    if lower.startswith("fatty acids"):
        parts = raw_name.split(",")
        if len(parts) >= 2:
            qualifier = parts[-1].replace("total", "").strip().capitalize()
            return ("Fat", qualifier if qualifier else "Other")
        return ("Fat", "Other")

    return ("Others", _PAREN_RE.sub("", raw_name).split(",")[0].strip().capitalize())


def fetch_food_nutrients(fdc_id: int) -> list[dict[str, Any]]:
    """Fetch nutrient data for a food via the FDC API.

    Returns a list of dicts with keys: nutrient_id, name, amount, unit, kind.
    Returns an empty list if the API is unavailable or the food is not found.
    """
    client = get_fdc_client()
    if client is None:
        log.warning("fetch_food_nutrients: FDC client not available")
        return []

    t0 = time.monotonic()
    log.info("fetch_food_nutrients fdc_id=%s start", fdc_id)

    try:
        food = client.get_food(fdc_id)
    except Exception as exc:
        elapsed = time.monotonic() - t0
        log.error("fetch_food_nutrients fdc_id=%s failed after %.2fs: %s", fdc_id, elapsed, exc)
        return []

    elapsed = time.monotonic() - t0
    nutrients = []
    for n in food.nutrients:
        if n.amount is None or n.amount == 0:
            continue

        kind, name = normalize_nutrient_name(n.name, n.unit_name or "")
        if kind == "_skip":
            continue

        nutrients.append({
            "nutrient_id": n.id,
            "name": name,
            "kind": kind,
            "amount": n.amount,
            "unit": n.unit_name,
        })

    log.info(
        "fetch_food_nutrients fdc_id=%s done: %d nutrients in %.2fs",
        fdc_id, len(nutrients), elapsed,
    )
    return nutrients
