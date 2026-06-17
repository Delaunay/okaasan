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

from .models import StockPrice, OptionChainSnapshot, OptionHistoricalBar, IntradayPrice, WatchlistItem

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
        end = date.today() + timedelta(days=1)
    if start is None:
        latest = db.query(func.max(StockPrice.date)).filter(
            StockPrice.symbol == symbol
        ).scalar()
        start = (latest + timedelta(days=1)) if latest else None

    if start is not None and start >= end:
        return {"symbol": symbol, "rows_added": 0, "message": "already up to date"}

    ticker = yf.Ticker(symbol)
    if start is None:
        hist = ticker.history(period="max", auto_adjust=False)
    else:
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


# ── Intraday Prices (yfinance) ────────────────────────────────────────


def fetch_intraday_prices(
    db: Session,
    symbol: str,
    *,
    interval: str = "5m",
    period: str = "1d",
) -> dict:
    """Fetch intraday OHLCV bars and accumulate in local DB.

    Yahoo retains 1m data for ~7 days, 5m for ~60 days.
    By fetching daily we build a permanent intraday archive.
    """
    import yfinance as yf

    valid_intervals = ("1m", "2m", "5m", "15m", "30m", "60m", "1h")
    if interval not in valid_intervals:
        return {"symbol": symbol, "error": f"invalid interval, use one of {valid_intervals}"}

    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval=interval, prepost=False)

    if hist.empty:
        return {"symbol": symbol, "rows_added": 0, "message": "no intraday data"}

    added = 0
    for idx, row in hist.iterrows():
        ts = idx.to_pydatetime()
        if ts.tzinfo:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)

        exists = db.query(IntradayPrice).filter_by(
            symbol=symbol, timestamp=ts, interval=interval,
        ).first()
        if exists:
            continue

        db.add(IntradayPrice(
            symbol=symbol,
            timestamp=ts,
            interval=interval,
            open=_safe_float(row.get("Open")),
            high=_safe_float(row.get("High")),
            low=_safe_float(row.get("Low")),
            close=_safe_float(row.get("Close")),
            volume=_safe_float(row.get("Volume")),
        ))
        added += 1

    db.commit()
    log.info("Fetched %d intraday bars (%s) for %s", added, interval, symbol)
    return {"symbol": symbol, "rows_added": added, "interval": interval}


# ── Option Chain Snapshots (yfinance) ────────────────────────────────


def _current_session_label() -> str:
    """Determine market session based on current US Eastern time."""
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo  # type: ignore

    et = datetime.now(ZoneInfo("America/New_York"))
    hour = et.hour + et.minute / 60.0
    if hour < 11.0:
        return "open"
    elif hour < 14.0:
        return "midday"
    else:
        return "close"


def fetch_option_chain(
    db: Session, symbol: str, *, max_expirations: int = 0, session_label: str | None = None,
) -> dict:
    """Snapshot the current option chain via yfinance and store.

    session_label: "open", "midday", or "close". Auto-detected from current time if not provided.
    """
    import yfinance as yf

    ticker = yf.Ticker(symbol)
    expirations = ticker.options
    if not expirations:
        return {"symbol": symbol, "contracts_added": 0, "message": "no expirations"}

    today = date.today()
    label = session_label or _current_session_label()
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
                    snapshot_time=label,
                    expiration=exp_date,
                    strike=strike,
                    option_type=opt_type,
                ).first()
                if exists:
                    continue

                db.add(OptionChainSnapshot(
                    symbol=symbol,
                    snapshot_date=today,
                    snapshot_time=label,
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
    log.info("Fetched %d option contracts for %s [%s]", added, symbol, label)
    return {"symbol": symbol, "contracts_added": added, "expirations": len(expirations), "session": label}


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
    intraday_interval = config.get("intraday_interval", "5m")

    results = {"prices": [], "intraday": [], "options": [], "alpaca_options": []}

    for sym in symbols:
        try:
            r = fetch_stock_prices(db, sym)
            results["prices"].append(r)
        except Exception as exc:
            log.error("Price fetch failed for %s: %s", sym, exc)
            results["prices"].append({"symbol": sym, "error": str(exc)})

    # Intraday prices for all watchlist symbols + option symbols
    intraday_symbols = list(set(symbols + option_symbols))
    for sym in intraday_symbols:
        try:
            r = fetch_intraday_prices(db, sym, interval=intraday_interval)
            results["intraday"].append(r)
        except Exception as exc:
            log.error("Intraday fetch failed for %s: %s", sym, exc)
            results["intraday"].append({"symbol": sym, "error": str(exc)})

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
