"""Fetch economic indicator data from FRED and Bank of Canada."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import EconomicSeries

log = logging.getLogger("okaasan.investing.economics")

# ── Series catalog ────────────────────────────────────────────────────

US_GDP_COMPONENTS = {
    "GDP": "Gross Domestic Product",
    "PCEC96": "Personal Consumption (real)",
    "GPDIC1": "Private Investment (real)",
    "GCEC1": "Government Spending (real)",
    "NETEXC": "Net Exports (real)",
}

US_LEADING_INDICATORS = {
    "T10Y2Y": "10Y-2Y Yield Spread",
    "UMCSENT": "Consumer Sentiment (UMich)",
    "ICSA": "Initial Jobless Claims",
    "PERMIT": "Building Permits",
    "UNRATE": "Unemployment Rate",
    "CPIAUCSL": "CPI (All Urban)",
    "FEDFUNDS": "Federal Funds Rate",
    "GS10": "10-Year Treasury Yield",
    "GS2": "2-Year Treasury Yield",
    "INDPRO": "Industrial Production Index",
    "M2SL": "Money Supply M2",
}

CA_SERIES_BOC = {
    "STATIC_BANKRATE": "Bank of Canada Policy Rate",
}

CA_SERIES_FRED = {
    "NGDPSAXDCCAQ": "Canada GDP (nominal, SA)",
    "CANCPIALLMINMEI": "Canada CPI",
    "LRUNTTTTCAM156S": "Canada Unemployment Rate",
    "IRLTLT01CAM156N": "Canada Long-Term Interest Rate",
    "IRSTCB01CAM156N": "Canada Short-Term Interest Rate",
    "NAEXKP01CAQ189S": "Canada Exports",
    "NAEXKP06CAQ189S": "Canada Imports",
    "NAEXKP02CAQ189S": "Canada Private Consumption",
    "NAEXKP03CAQ189S": "Canada Government Consumption",
    "NAEXKP04CAQ189S": "Canada Gross Capital Formation",
}

EU_GDP_COMPONENTS = {
    "CLVMNACSCAB1GQEA19": "Euro Area GDP (real)",
    "NAEXKP02EZQ189S": "Euro Area Private Consumption",
    "NAEXKP03EZQ189S": "Euro Area Government Consumption",
    "NAEXKP04EZQ189S": "Euro Area Gross Capital Formation",
    "NAEXKP01EZQ189S": "Euro Area Exports",
    "NAEXKP06EZQ189S": "Euro Area Imports",
}

EU_INDICATORS_FRED = {
    "EA19CPALTT01GYM": "Euro Area CPI (YoY %)",
    "LRHUTTTTEZM156S": "Euro Area Unemployment Rate",
    "ECBDFR": "ECB Deposit Facility Rate",
    "ECBMRRFR": "ECB Main Refinancing Rate",
    "IRLTLT01EZM156N": "Euro Area Long-Term Interest Rate",
    "EA19BSCICP02STSAM": "Euro Area Business Confidence",
    "EA19CSINFT01STSAM": "Euro Area Consumer Confidence",
    "EA19PRINTO01IXOBSAM": "Euro Area Industrial Production",
    "MABMM301EZM189S": "Euro Area Money Supply M3",
}

ALL_SERIES: dict[str, dict[str, str]] = {
    "us_gdp": US_GDP_COMPONENTS,
    "us_indicators": US_LEADING_INDICATORS,
    "ca_indicators": CA_SERIES_FRED,
    "eu_gdp": EU_GDP_COMPONENTS,
    "eu_indicators": EU_INDICATORS_FRED,
}

SERIES_METADATA: dict[str, str] = {}
for group in ALL_SERIES.values():
    SERIES_METADATA.update(group)
SERIES_METADATA.update(CA_SERIES_BOC)


# ── FRED fetcher ──────────────────────────────────────────────────────


def fetch_fred_series(
    db: Session,
    series_id: str,
    api_key: str,
    *,
    start: date | None = None,
) -> dict:
    """Fetch a FRED series and upsert into the cache table."""
    if not api_key:
        return {"series_id": series_id, "error": "No FRED API key configured"}

    if start is None:
        latest = (
            db.query(func.max(EconomicSeries.date))
            .filter(EconomicSeries.series_id == series_id)
            .scalar()
        )
        start = (latest + timedelta(days=1)) if latest else date(1950, 1, 1)

    url = "https://api.stlouisfed.org/fred/series/observations"
    params = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "observation_start": start.isoformat(),
        "sort_order": "asc",
    }

    try:
        resp = httpx.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        log.error("FRED fetch failed for %s: %s", series_id, exc)
        return {"series_id": series_id, "error": str(exc)}

    added = 0
    for obs in data.get("observations", []):
        d = date.fromisoformat(obs["date"])
        val = obs.get("value")
        if val is None or val == ".":
            continue
        try:
            fval = float(val)
        except (ValueError, TypeError):
            continue

        existing = db.query(EconomicSeries).filter_by(
            series_id=series_id, date=d
        ).first()
        if existing:
            continue

        db.add(EconomicSeries(
            series_id=series_id,
            source="fred",
            date=d,
            value=fval,
        ))
        added += 1

    db.commit()
    log.info("FRED %s: added %d observations", series_id, added)
    return {"series_id": series_id, "rows_added": added}


# ── Bank of Canada fetcher ────────────────────────────────────────────


def fetch_boc_series(
    db: Session,
    series_id: str,
    *,
    start: date | None = None,
) -> dict:
    """Fetch from Bank of Canada Valet API (no key required)."""
    if start is None:
        latest = (
            db.query(func.max(EconomicSeries.date))
            .filter(EconomicSeries.series_id == series_id)
            .scalar()
        )
        start = (latest + timedelta(days=1)) if latest else date(2000, 1, 1)

    url = f"https://www.bankofcanada.ca/valet/observations/{series_id}/json"
    params = {"start_date": start.isoformat()}

    try:
        resp = httpx.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        log.error("BoC fetch failed for %s: %s", series_id, exc)
        return {"series_id": series_id, "error": str(exc)}

    added = 0
    for obs in data.get("observations", []):
        d_str = obs.get("d")
        val_obj = obs.get(series_id, {})
        val = val_obj.get("v") if isinstance(val_obj, dict) else None
        if not d_str or val is None:
            continue
        try:
            d = date.fromisoformat(d_str)
            fval = float(val)
        except (ValueError, TypeError):
            continue

        existing = db.query(EconomicSeries).filter_by(
            series_id=series_id, date=d
        ).first()
        if existing:
            continue

        db.add(EconomicSeries(
            series_id=series_id,
            source="boc",
            date=d,
            value=fval,
        ))
        added += 1

    db.commit()
    log.info("BoC %s: added %d observations", series_id, added)
    return {"series_id": series_id, "rows_added": added}


# ── Refresh all economics data ────────────────────────────────────────


def refresh_economics(db: Session, fred_api_key: str) -> dict:
    """Fetch all configured economic series."""
    results: dict[str, Any] = {"fred": [], "boc": []}

    all_fred_ids = set()
    for group in ALL_SERIES.values():
        all_fred_ids.update(group.keys())
    all_fred_ids.update(CA_SERIES_FRED.keys())

    for sid in sorted(all_fred_ids):
        try:
            r = fetch_fred_series(db, sid, fred_api_key)
            results["fred"].append(r)
        except Exception as exc:
            log.error("Economics FRED fetch failed for %s: %s", sid, exc)
            results["fred"].append({"series_id": sid, "error": str(exc)})

    for sid in CA_SERIES_BOC:
        try:
            r = fetch_boc_series(db, sid)
            results["boc"].append(r)
        except Exception as exc:
            log.error("Economics BoC fetch failed for %s: %s", sid, exc)
            results["boc"].append({"series_id": sid, "error": str(exc)})

    return results
