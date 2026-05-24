"""API routes for the Investing section."""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from .models import WatchlistItem, StockPrice, OptionChainSnapshot, OptionHistoricalBar, EconomicSeries

log = logging.getLogger("okaasan.investing")

router = APIRouter(prefix="/investing", tags=["investing"])

_scheduler = None


def _get_inv_db(request: Request):
    db = request.app.state.InvestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _compute_max_pain(contracts) -> dict | None:
    """Find the strike where total option exercise payout is minimized."""
    by_strike: dict[float, dict] = {}
    for c in contracts:
        oi = c.open_interest or 0
        if oi <= 0:
            continue
        s = c.strike
        by_strike.setdefault(s, {"call_oi": 0, "put_oi": 0})
        if c.option_type == "call":
            by_strike[s]["call_oi"] += oi
        else:
            by_strike[s]["put_oi"] += oi

    if not by_strike:
        return None

    strikes = sorted(by_strike.keys())
    min_pain = float("inf")
    max_pain_strike = strikes[0]
    pain_by_strike = []

    for settle in strikes:
        total = 0.0
        for s in strikes:
            info = by_strike[s]
            total += info["call_oi"] * max(0.0, settle - s) * 100
            total += info["put_oi"] * max(0.0, s - settle) * 100
        pain_by_strike.append({"strike": s, "pain": round(total, 2)})
        if total < min_pain:
            min_pain = total
            max_pain_strike = settle

    return {"strike": max_pain_strike, "value": round(min_pain, 2)}


def _compute_analytics(contracts, underlying_price) -> dict:
    """Compute OI walls, volume/OI flags, IV skew, and IV term structure."""
    from datetime import date as _date

    today = _date.today()

    oi_by_strike: list[dict] = []
    vol_oi_flags: list[dict] = []
    strike_map: dict[float, dict] = {}

    for c in contracts:
        s = c.strike
        oi = c.open_interest or 0
        vol = c.volume or 0
        iv = c.implied_volatility

        if s not in strike_map:
            strike_map[s] = {"strike": s, "call_oi": 0, "put_oi": 0, "call_vol": 0, "put_vol": 0}
        if c.option_type == "call":
            strike_map[s]["call_oi"] += oi
            strike_map[s]["call_vol"] += vol
        else:
            strike_map[s]["put_oi"] += oi
            strike_map[s]["put_vol"] += vol

        if oi > 0 and vol > 0:
            ratio = round(vol / oi, 2)
            vol_oi_flags.append({
                "strike": s,
                "option_type": c.option_type,
                "volume": vol,
                "open_interest": oi,
                "vol_oi_ratio": ratio,
                "expiration": c.expiration.isoformat() if c.expiration else None,
                "dte": (c.expiration - today).days if c.expiration else None,
            })

    oi_by_strike = sorted(strike_map.values(), key=lambda x: x["strike"])

    iv_term: list[dict] = []
    iv_skew_by_exp: dict[str, dict] = {}

    by_exp: dict[str, list] = {}
    for c in contracts:
        key = c.expiration.isoformat() if c.expiration else ""
        by_exp.setdefault(key, []).append(c)

    for exp, clist in sorted(by_exp.items()):
        exp_date = clist[0].expiration if clist else None
        dte = (exp_date - today).days if exp_date else None

        calls_with_iv = [(c.strike, c.implied_volatility) for c in clist
                         if c.option_type == "call" and c.implied_volatility and c.implied_volatility > 0.001]
        puts_with_iv = [(c.strike, c.implied_volatility) for c in clist
                        if c.option_type == "put" and c.implied_volatility and c.implied_volatility > 0.001]

        if not calls_with_iv and not puts_with_iv:
            continue

        atm_ref = underlying_price or 0
        if atm_ref and calls_with_iv:
            atm_call = min(calls_with_iv, key=lambda x: abs(x[0] - atm_ref))
            iv_term.append({
                "expiration": exp, "dte": dte,
                "atm_iv": round(atm_call[1] * 100, 2), "type": "call",
            })
        if atm_ref and puts_with_iv:
            atm_put = min(puts_with_iv, key=lambda x: abs(x[0] - atm_ref))
            iv_term.append({
                "expiration": exp, "dte": dte,
                "atm_iv": round(atm_put[1] * 100, 2), "type": "put",
            })

        if atm_ref and calls_with_iv and puts_with_iv:
            otm_puts = [(s, iv) for s, iv in puts_with_iv if s < atm_ref]
            otm_calls = [(s, iv) for s, iv in calls_with_iv if s > atm_ref]
            if otm_puts and otm_calls:
                target_dist = atm_ref * 0.05
                best_put = min(otm_puts, key=lambda x: abs((atm_ref - x[0]) - target_dist))
                best_call = min(otm_calls, key=lambda x: abs((x[0] - atm_ref) - target_dist))
                skew = round((best_put[1] - best_call[1]) * 100, 2)
                iv_skew_by_exp[exp] = {
                    "expiration": exp, "dte": dte, "skew": skew,
                    "otm_put_strike": best_put[0], "otm_put_iv": round(best_put[1] * 100, 2),
                    "otm_call_strike": best_call[0], "otm_call_iv": round(best_call[1] * 100, 2),
                }

    return {
        "oi_by_strike": oi_by_strike,
        "vol_oi_flags": sorted(vol_oi_flags, key=lambda x: -x["vol_oi_ratio"])[:50],
        "iv_term_structure": iv_term,
        "iv_skew_by_expiration": list(iv_skew_by_exp.values()),
    }


def _compute_sentiment(contracts) -> dict:
    call_oi = put_oi = 0.0
    call_vol = put_vol = 0.0
    call_dollar = put_dollar = 0.0
    for c in contracts:
        oi = c.open_interest or 0
        vol = c.volume or 0
        price = c.last or 0
        notional = oi * price * 100
        if c.option_type == "call":
            call_oi += oi
            call_vol += vol
            call_dollar += notional
        else:
            put_oi += oi
            put_vol += vol
            put_dollar += notional
    return {
        "pcr_oi": round(put_oi / call_oi, 4) if call_oi else None,
        "pcr_volume": round(put_vol / call_vol, 4) if call_vol else None,
        "pcr_dollar": round(put_dollar / call_dollar, 4) if call_dollar else None,
        "total_call_oi": call_oi,
        "total_put_oi": put_oi,
        "total_call_volume": call_vol,
        "total_put_volume": put_vol,
        "total_call_dollar": round(call_dollar, 2),
        "total_put_dollar": round(put_dollar, 2),
    }


# ── Watchlist ─────────────────────────────────────────────────────────


@router.get("/watchlist")
def list_watchlist(db: Session = Depends(_get_inv_db)):
    items = db.query(WatchlistItem).order_by(WatchlistItem.added_at).all()
    return [w.to_json() for w in items]


@router.post("/watchlist")
async def add_to_watchlist(request: Request, db: Session = Depends(_get_inv_db)):
    data = await request.json()
    symbol = (data.get("symbol") or "").strip().upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    existing = db.query(WatchlistItem).filter_by(symbol=symbol).first()
    if existing:
        return existing.to_json()

    name = data.get("name") or ""
    if not name:
        try:
            import yfinance as yf
            info = yf.Ticker(symbol).info or {}
            name = info.get("shortName") or info.get("longName") or symbol
        except Exception:
            name = symbol

    item = WatchlistItem(
        symbol=symbol,
        name=name,
        asset_type=data.get("asset_type", "stock"),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item.to_json()


@router.delete("/watchlist/{symbol}")
def remove_from_watchlist(symbol: str, db: Session = Depends(_get_inv_db)):
    symbol = symbol.upper()
    item = db.query(WatchlistItem).filter_by(symbol=symbol).first()
    if not item:
        raise HTTPException(status_code=404, detail="Symbol not in watchlist")
    db.delete(item)
    db.commit()
    return {"message": f"Removed {symbol}"}


# ── Prices ────────────────────────────────────────────────────────────


@router.get("/prices/{symbol}")
def get_prices(
    symbol: str,
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: Session = Depends(_get_inv_db),
):
    symbol = symbol.upper()
    q = db.query(StockPrice).filter(StockPrice.symbol == symbol)

    if start:
        q = q.filter(StockPrice.date >= date.fromisoformat(start))
    if end:
        q = q.filter(StockPrice.date <= date.fromisoformat(end))

    rows = q.order_by(StockPrice.date).all()
    return {"symbol": symbol, "prices": [r.to_json() for r in rows]}


@router.post("/prices/{symbol}/backfill")
def backfill_prices(symbol: str, request: Request, db: Session = Depends(_get_inv_db)):
    """Delete all stored prices for a symbol and re-fetch full history."""
    from .fetcher import fetch_stock_prices

    symbol = symbol.upper()
    deleted = db.query(StockPrice).filter(StockPrice.symbol == symbol).delete()
    db.commit()
    result = fetch_stock_prices(db, symbol)
    result["deleted"] = deleted
    return result


# ── Ticker Detail ────────────────────────────────────────────────────


@router.get("/ticker/{symbol}")
def get_ticker_detail(symbol: str, db: Session = Depends(_get_inv_db)):
    """Combined endpoint for the ticker detail page."""
    symbol = symbol.upper()

    watchlist_item = db.query(WatchlistItem).filter_by(symbol=symbol).first()

    latest_prices = (
        db.query(StockPrice)
        .filter(StockPrice.symbol == symbol)
        .order_by(desc(StockPrice.date))
        .limit(2)
        .all()
    )
    latest = latest_prices[0] if latest_prices else None
    prev = latest_prices[1] if len(latest_prices) > 1 else None

    change = change_pct = None
    if latest and prev and prev.close and latest.close:
        change = round(latest.close - prev.close, 4)
        change_pct = round((change / prev.close) * 100, 2)

    total_price_rows = db.query(func.count(StockPrice.id)).filter(
        StockPrice.symbol == symbol
    ).scalar() or 0

    date_range = None
    if total_price_rows > 0:
        min_date = db.query(func.min(StockPrice.date)).filter(StockPrice.symbol == symbol).scalar()
        max_date = db.query(func.max(StockPrice.date)).filter(StockPrice.symbol == symbol).scalar()
        date_range = {
            "start": min_date.isoformat() if min_date else None,
            "end": max_date.isoformat() if max_date else None,
        }

    has_options = db.query(OptionChainSnapshot).filter(
        OptionChainSnapshot.symbol == symbol
    ).first() is not None

    return {
        "symbol": symbol,
        "name": watchlist_item.name if watchlist_item else symbol,
        "asset_type": watchlist_item.asset_type if watchlist_item else None,
        "on_watchlist": watchlist_item is not None,
        "latest_price": latest.close if latest else None,
        "latest_date": latest.date.isoformat() if latest and latest.date else None,
        "change": change,
        "change_pct": change_pct,
        "high": latest.high if latest else None,
        "low": latest.low if latest else None,
        "open": latest.open if latest else None,
        "volume": latest.volume if latest else None,
        "total_price_rows": total_price_rows,
        "date_range": date_range,
        "has_options": has_options,
    }


# ── Options ───────────────────────────────────────────────────────────


@router.get("/options/{symbol}")
def get_option_chain(
    symbol: str,
    snapshot_date: str | None = Query(None),
    expiration: str | None = Query(None),
    option_type: str | None = Query(None),
    db: Session = Depends(_get_inv_db),
):
    """Get option chain snapshot (latest or specific date)."""
    symbol = symbol.upper()

    if snapshot_date:
        snap_date = date.fromisoformat(snapshot_date)
    else:
        snap_date = db.query(func.max(OptionChainSnapshot.snapshot_date)).filter(
            OptionChainSnapshot.symbol == symbol
        ).scalar()
        if not snap_date:
            return {"symbol": symbol, "snapshot_date": None, "expirations": [], "contracts": []}

    q = db.query(OptionChainSnapshot).filter(
        OptionChainSnapshot.symbol == symbol,
        OptionChainSnapshot.snapshot_date == snap_date,
    )
    if expiration:
        q = q.filter(OptionChainSnapshot.expiration == date.fromisoformat(expiration))
    if option_type:
        q = q.filter(OptionChainSnapshot.option_type == option_type)

    contracts = q.order_by(
        OptionChainSnapshot.expiration,
        OptionChainSnapshot.strike,
        OptionChainSnapshot.option_type,
    ).all()

    expirations = sorted(set(c.expiration.isoformat() for c in contracts if c.expiration))

    underlying_price = None
    for c in contracts:
        if c.underlying_price is not None:
            underlying_price = c.underlying_price
            break

    sentiment = _compute_sentiment(contracts)

    by_exp: dict[str, list] = {}
    for c in contracts:
        key = c.expiration.isoformat() if c.expiration else ""
        by_exp.setdefault(key, []).append(c)
    sentiment_by_expiration = {
        exp: _compute_sentiment(clist) for exp, clist in sorted(by_exp.items())
    }

    max_pain_by_expiration = {
        exp: _compute_max_pain(clist) for exp, clist in sorted(by_exp.items())
    }
    analytics = _compute_analytics(contracts, underlying_price)

    return {
        "symbol": symbol,
        "snapshot_date": snap_date.isoformat() if snap_date else None,
        "underlying_price": underlying_price,
        "expirations": expirations,
        "total_contracts": len(contracts),
        "sentiment": sentiment,
        "sentiment_by_expiration": sentiment_by_expiration,
        "max_pain_by_expiration": max_pain_by_expiration,
        "analytics": analytics,
        "contracts": [c.to_json() for c in contracts],
    }


@router.get("/options/{symbol}/history")
def get_option_history(
    symbol: str,
    option_symbol: str | None = Query(None),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: Session = Depends(_get_inv_db),
):
    """Get historical option bars (from Alpaca)."""
    q = db.query(OptionHistoricalBar)

    if option_symbol:
        q = q.filter(OptionHistoricalBar.option_symbol == option_symbol)
    else:
        q = q.filter(OptionHistoricalBar.option_symbol.like(f"{symbol.upper()}%"))

    if start:
        q = q.filter(OptionHistoricalBar.timestamp >= start)
    if end:
        q = q.filter(OptionHistoricalBar.timestamp <= end)

    rows = q.order_by(OptionHistoricalBar.timestamp).limit(5000).all()
    return {"bars": [r.to_json() for r in rows]}


# ── Overview ──────────────────────────────────────────────────────────


@router.get("/overview")
def investing_overview(db: Session = Depends(_get_inv_db)):
    """Dashboard data: watchlist with latest prices and daily changes."""
    watchlist = db.query(WatchlistItem).order_by(WatchlistItem.added_at).all()

    items = []
    for w in watchlist:
        latest_prices = (
            db.query(StockPrice)
            .filter(StockPrice.symbol == w.symbol)
            .order_by(desc(StockPrice.date))
            .limit(2)
            .all()
        )

        latest = latest_prices[0] if latest_prices else None
        prev = latest_prices[1] if len(latest_prices) > 1 else None

        change = None
        change_pct = None
        if latest and prev and prev.close and latest.close:
            change = round(latest.close - prev.close, 4)
            change_pct = round((change / prev.close) * 100, 2)

        sparkline = [
            r.close for r in db.query(StockPrice)
            .filter(StockPrice.symbol == w.symbol)
            .order_by(desc(StockPrice.date))
            .limit(30)
            .all()
            if r.close is not None
        ]
        sparkline.reverse()

        items.append({
            **w.to_json(),
            "latest_price": latest.close if latest else None,
            "latest_date": latest.date.isoformat() if latest and latest.date else None,
            "change": change,
            "change_pct": change_pct,
            "sparkline": sparkline,
        })

    option_summary = []
    option_symbols = (
        db.query(OptionChainSnapshot.symbol)
        .distinct()
        .all()
    )
    for (sym,) in option_symbols:
        latest_snap = db.query(func.max(OptionChainSnapshot.snapshot_date)).filter(
            OptionChainSnapshot.symbol == sym,
        ).scalar()
        if not latest_snap:
            continue
        count = db.query(OptionChainSnapshot).filter(
            OptionChainSnapshot.symbol == sym,
            OptionChainSnapshot.snapshot_date == latest_snap,
        ).count()
        exps = db.query(func.count(func.distinct(OptionChainSnapshot.expiration))).filter(
            OptionChainSnapshot.symbol == sym,
            OptionChainSnapshot.snapshot_date == latest_snap,
        ).scalar()
        spot = db.query(OptionChainSnapshot.underlying_price).filter(
            OptionChainSnapshot.symbol == sym,
            OptionChainSnapshot.snapshot_date == latest_snap,
            OptionChainSnapshot.underlying_price.isnot(None),
        ).limit(1).scalar()
        option_summary.append({
            "symbol": sym,
            "snapshot_date": latest_snap.isoformat(),
            "total_contracts": count,
            "expirations": exps,
            "underlying_price": spot,
        })

    return {
        "watchlist": items,
        "option_summary": option_summary,
    }


# ── Manual fetch ──────────────────────────────────────────────────────


@router.post("/fetch")
async def manual_fetch(request: Request):
    """Trigger a manual data refresh for all watchlist symbols."""
    global _scheduler
    if _scheduler:
        import asyncio
        result = await asyncio.to_thread(_scheduler.refresh_now)
        return {"message": "Refresh complete", **result}

    from .fetcher import refresh_all, load_config
    static_folder = request.app.state.static_folder
    config = load_config(static_folder)
    db = request.app.state.InvestingSessionLocal()
    try:
        result = refresh_all(db, config)
        return {"message": "Refresh complete", **result}
    finally:
        db.close()


@router.post("/fetch/{symbol}")
async def fetch_single(symbol: str, request: Request):
    """Fetch data for a single symbol."""
    import asyncio
    from .fetcher import fetch_stock_prices, load_config

    symbol = symbol.upper()
    db = request.app.state.InvestingSessionLocal()
    try:
        result = await asyncio.to_thread(fetch_stock_prices, db, symbol)
        return result
    finally:
        db.close()


# ── Economics ─────────────────────────────────────────────────────────


@router.get("/economics/catalog")
def economics_catalog():
    """Return the catalog of available economic series."""
    from .economics import ALL_SERIES, CA_SERIES_BOC, SERIES_METADATA

    return {
        "groups": {
            name: {sid: SERIES_METADATA[sid] for sid in group}
            for name, group in ALL_SERIES.items()
        },
        "boc": {sid: label for sid, label in CA_SERIES_BOC.items()},
        "metadata": SERIES_METADATA,
    }


@router.get("/economics/series/{series_id}")
def get_economic_series(
    series_id: str,
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: Session = Depends(_get_inv_db),
):
    """Get cached economic series data."""
    q = db.query(EconomicSeries).filter(EconomicSeries.series_id == series_id)
    if start:
        q = q.filter(EconomicSeries.date >= date.fromisoformat(start))
    if end:
        q = q.filter(EconomicSeries.date <= date.fromisoformat(end))
    rows = q.order_by(EconomicSeries.date).all()
    return {
        "series_id": series_id,
        "count": len(rows),
        "data": [r.to_json() for r in rows],
    }


@router.get("/economics/multi")
def get_economic_multi(
    ids: str = Query(..., description="Comma-separated series IDs"),
    start: str | None = Query(None),
    end: str | None = Query(None),
    db: Session = Depends(_get_inv_db),
):
    """Get multiple economic series in one request."""
    series_ids = [s.strip() for s in ids.split(",") if s.strip()]
    result: dict = {}
    for sid in series_ids:
        q = db.query(EconomicSeries).filter(EconomicSeries.series_id == sid)
        if start:
            q = q.filter(EconomicSeries.date >= date.fromisoformat(start))
        if end:
            q = q.filter(EconomicSeries.date <= date.fromisoformat(end))
        rows = q.order_by(EconomicSeries.date).all()
        result[sid] = [r.to_json() for r in rows]
    return result


@router.post("/economics/refresh")
async def refresh_economics_data(request: Request):
    """Fetch latest data for all economic series."""
    import asyncio
    from .fetcher import load_config
    from .economics import refresh_economics

    config = load_config(request.app.state.static_folder)
    fred_key = config.get("fred_api_key", "")
    db = request.app.state.InvestingSessionLocal()
    try:
        result = await asyncio.to_thread(refresh_economics, db, fred_key)
        return result
    finally:
        db.close()


@router.post("/economics/fetch/{series_id}")
async def fetch_single_series(series_id: str, request: Request):
    """Fetch a single economic series."""
    import asyncio
    from .fetcher import load_config
    from .economics import fetch_fred_series, fetch_boc_series, CA_SERIES_BOC

    config = load_config(request.app.state.static_folder)
    fred_key = config.get("fred_api_key", "")
    db = request.app.state.InvestingSessionLocal()
    try:
        if series_id in CA_SERIES_BOC:
            result = await asyncio.to_thread(fetch_boc_series, db, series_id)
        else:
            result = await asyncio.to_thread(fetch_fred_series, db, series_id, fred_key)
        return result
    finally:
        db.close()


# ── Status / Config ───────────────────────────────────────────────────


@router.get("/status")
def investing_status(request: Request, db: Session = Depends(_get_inv_db)):
    from .fetcher import load_config

    config = load_config(request.app.state.static_folder)
    has_alpaca = bool(config.get("alpaca_api_key"))
    has_fred = bool(config.get("fred_api_key"))

    global _scheduler
    last_refresh = _scheduler.last_refresh.isoformat() + "Z" if _scheduler and _scheduler.last_refresh else None
    last_error = _scheduler.last_error if _scheduler else None

    total_prices = db.query(func.count(StockPrice.id)).scalar() or 0
    total_options = db.query(func.count(OptionChainSnapshot.id)).scalar() or 0
    total_hist = db.query(func.count(OptionHistoricalBar.id)).scalar() or 0
    watchlist_count = db.query(func.count(WatchlistItem.id)).scalar() or 0

    return {
        "has_alpaca_key": has_alpaca,
        "has_fred_key": has_fred,
        "refresh_interval_minutes": config.get("refresh_interval_minutes", 60),
        "option_symbols": config.get("option_symbols", ["SPY"]),
        "max_expirations": config.get("max_expirations", 0),
        "last_refresh": last_refresh,
        "last_error": last_error,
        "total_price_rows": total_prices,
        "total_option_snapshots": total_options,
        "total_historical_bars": total_hist,
        "watchlist_count": watchlist_count,
    }


@router.post("/configure")
async def configure(request: Request):
    from .fetcher import load_config, save_config

    data = await request.json()
    static_folder = request.app.state.static_folder
    config = load_config(static_folder)

    for key in ("alpaca_api_key", "alpaca_secret_key", "fred_api_key", "refresh_interval_minutes", "option_symbols", "max_expirations"):
        if key in data:
            config[key] = data[key]

    save_config(static_folder, config)

    global _scheduler
    if _scheduler and "refresh_interval_minutes" in data:
        _scheduler.update_interval(data["refresh_interval_minutes"])

    return {"message": "Configuration saved", "config": {
        k: ("***" if "secret" in k and v else v)
        for k, v in config.items()
    }}
