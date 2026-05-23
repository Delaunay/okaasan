"""Data fetcher for stock prices and option chains.

Uses yfinance (free, no key) for stock OHLCV and current option chains,
and Alpaca Market Data API (free tier, key required) for historical option bars.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import StockPrice, OptionChainSnapshot, OptionHistoricalBar, WatchlistItem

log = logging.getLogger("okaasan.investing.fetcher")


def load_config(static_folder: str | Path) -> dict:
    p = Path(static_folder) / "private" / "_investing.json"
    if p.is_file():
        with open(p) as f:
            return json.load(f)
    return {
        "alpaca_api_key": "",
        "alpaca_secret_key": "",
        "refresh_interval_minutes": 60,
        "option_symbols": ["SPY"],
    }


def save_config(static_folder: str | Path, config: dict) -> None:
    p = Path(static_folder) / "private" / "_investing.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w") as f:
        json.dump(config, f, indent=2)


# ── Stock Prices (yfinance) ──────────────────────────────────────────


def fetch_stock_prices(
    db: Session,
    symbol: str,
    start: date | None = None,
    end: date | None = None,
) -> dict:
    """Fetch OHLCV from yfinance and upsert into DB. Returns stats."""
    import yfinance as yf

    if end is None:
        end = date.today()
    if start is None:
        latest = db.query(func.max(StockPrice.date)).filter(
            StockPrice.symbol == symbol
        ).scalar()
        start = (latest + timedelta(days=1)) if latest else (end - timedelta(days=365 * 5))

    if start >= end:
        return {"symbol": symbol, "rows_added": 0, "message": "already up to date"}

    ticker = yf.Ticker(symbol)
    hist = ticker.history(start=start.isoformat(), end=end.isoformat(), auto_adjust=False)

    if hist.empty:
        return {"symbol": symbol, "rows_added": 0, "message": "no data from yfinance"}

    added = 0
    for idx, row in hist.iterrows():
        d = idx.date() if hasattr(idx, "date") else idx
        exists = db.query(StockPrice).filter_by(symbol=symbol, date=d).first()
        if exists:
            continue
        db.add(StockPrice(
            symbol=symbol,
            date=d,
            open=_safe_float(row.get("Open")),
            high=_safe_float(row.get("High")),
            low=_safe_float(row.get("Low")),
            close=_safe_float(row.get("Close")),
            volume=_safe_float(row.get("Volume")),
            adj_close=_safe_float(row.get("Adj Close")),
        ))
        added += 1

    db.commit()
    log.info("Fetched %d price rows for %s", added, symbol)
    return {"symbol": symbol, "rows_added": added}


# ── Option Chain Snapshots (yfinance) ────────────────────────────────


def fetch_option_chain(db: Session, symbol: str, *, max_expirations: int = 0) -> dict:
    """Snapshot the current option chain via yfinance and store."""
    import yfinance as yf

    ticker = yf.Ticker(symbol)
    expirations = ticker.options
    if not expirations:
        return {"symbol": symbol, "contracts_added": 0, "message": "no expirations"}

    today = date.today()
    added = 0

    spot = None
    try:
        info = ticker.info or {}
        spot = _safe_float(
            info.get("regularMarketPrice")
            or info.get("currentPrice")
            or info.get("previousClose")
        )
    except Exception:
        pass

    selected = expirations if max_expirations <= 0 else expirations[:max_expirations]
    for exp_str in selected:
        try:
            chain = ticker.option_chain(exp_str)
        except Exception as exc:
            log.warning("Failed to fetch option chain %s %s: %s", symbol, exp_str, exc)
            continue

        exp_date = date.fromisoformat(exp_str)

        for opt_type, df in [("call", chain.calls), ("put", chain.puts)]:
            for _, row in df.iterrows():
                strike = _safe_float(row.get("strike"))
                if strike is None:
                    continue

                exists = db.query(OptionChainSnapshot).filter_by(
                    symbol=symbol,
                    snapshot_date=today,
                    expiration=exp_date,
                    strike=strike,
                    option_type=opt_type,
                ).first()
                if exists:
                    continue

                db.add(OptionChainSnapshot(
                    symbol=symbol,
                    snapshot_date=today,
                    underlying_price=spot,
                    expiration=exp_date,
                    strike=strike,
                    option_type=opt_type,
                    bid=_safe_float(row.get("bid")),
                    ask=_safe_float(row.get("ask")),
                    last=_safe_float(row.get("lastPrice")),
                    volume=_safe_float(row.get("volume")),
                    open_interest=_safe_float(row.get("openInterest")),
                    implied_volatility=_safe_float(row.get("impliedVolatility")),
                ))
                added += 1

    db.commit()
    log.info("Fetched %d option contracts for %s", added, symbol)
    return {"symbol": symbol, "contracts_added": added, "expirations": len(expirations)}


# ── Historical Option Bars (Alpaca) ──────────────────────────────────


def fetch_option_history(
    db: Session,
    underlying: str,
    config: dict,
    *,
    expiration_date: str | None = None,
    limit: int = 100,
) -> dict:
    """Fetch historical option bars from Alpaca and store."""
    api_key = config.get("alpaca_api_key", "")
    secret_key = config.get("alpaca_secret_key", "")
    if not api_key or not secret_key:
        return {"error": "Alpaca API keys not configured"}

    try:
        from alpaca.data.historical import OptionHistoricalDataClient
        from alpaca.data.requests import OptionSnapshotRequest
    except ImportError:
        return {"error": "alpaca-py not installed"}

    client = OptionHistoricalDataClient(api_key, secret_key)

    req_params: dict[str, Any] = {"feed": "indicative"}
    if expiration_date:
        req_params["expiration_date"] = expiration_date

    try:
        request = OptionSnapshotRequest(
            underlying_symbol=underlying,
            **req_params,
        )
        snapshots = client.get_option_snapshot(request)
    except Exception as exc:
        log.error("Alpaca option snapshot failed: %s", exc)
        return {"error": str(exc)}

    added = 0
    for sym, snap in (snapshots or {}).items():
        if not snap or not snap.latest_trade:
            continue

        ts = snap.latest_trade.timestamp
        if ts and ts.tzinfo:
            ts = ts.replace(tzinfo=None)

        exists = db.query(OptionHistoricalBar).filter_by(
            option_symbol=str(sym), timestamp=ts,
        ).first()
        if exists:
            continue

        greeks = snap.greeks
        db.add(OptionHistoricalBar(
            option_symbol=str(sym),
            timestamp=ts,
            open=None,
            high=None,
            low=None,
            close=_safe_float(snap.latest_trade.price) if snap.latest_trade else None,
            volume=_safe_float(snap.latest_trade.size) if snap.latest_trade else None,
            vwap=None,
            trade_count=None,
        ))
        added += 1

    db.commit()
    log.info("Fetched %d option snapshots for %s from Alpaca", added, underlying)
    return {"underlying": underlying, "snapshots_added": added}


# ── Refresh all watchlist ────────────────────────────────────────────


def refresh_all(db: Session, config: dict) -> dict:
    """Fetch prices for all watchlist symbols + option chains for configured symbols."""
    symbols = [w.symbol for w in db.query(WatchlistItem).all()]
    option_symbols = config.get("option_symbols", ["SPY"])
    max_exp = config.get("max_expirations", 0)

    results = {"prices": [], "options": [], "alpaca_options": []}

    for sym in symbols:
        try:
            r = fetch_stock_prices(db, sym)
            results["prices"].append(r)
        except Exception as exc:
            log.error("Price fetch failed for %s: %s", sym, exc)
            results["prices"].append({"symbol": sym, "error": str(exc)})

    for sym in option_symbols:
        try:
            r = fetch_option_chain(db, sym, max_expirations=max_exp)
            results["options"].append(r)
        except Exception as exc:
            log.error("Option chain fetch failed for %s: %s", sym, exc)
            results["options"].append({"symbol": sym, "error": str(exc)})

    if config.get("alpaca_api_key"):
        for sym in option_symbols:
            try:
                r = fetch_option_history(db, sym, config)
                results["alpaca_options"].append(r)
            except Exception as exc:
                log.error("Alpaca option fetch failed for %s: %s", sym, exc)
                results["alpaca_options"].append({"symbol": sym, "error": str(exc)})

    return results


def _safe_float(v) -> float | None:
    if v is None:
        return None
    try:
        import math
        f = float(v)
        return None if math.isnan(f) or math.isinf(f) else f
    except (ValueError, TypeError):
        return None
