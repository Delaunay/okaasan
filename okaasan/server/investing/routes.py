"""API routes for the Investing section."""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from .models import WatchlistItem, StockPrice, OptionChainSnapshot, OptionHistoricalBar

log = logging.getLogger("okaasan.investing")

router = APIRouter(prefix="/investing", tags=["investing"])

_scheduler = None


def _get_inv_db(request: Request):
    db = request.app.state.InvestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


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

    return {
        "symbol": symbol,
        "snapshot_date": snap_date.isoformat() if snap_date else None,
        "expirations": expirations,
        "total_contracts": len(contracts),
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
        option_summary.append({
            "symbol": sym,
            "snapshot_date": latest_snap.isoformat(),
            "total_contracts": count,
            "expirations": exps,
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


# ── Status / Config ───────────────────────────────────────────────────


@router.get("/status")
def investing_status(request: Request, db: Session = Depends(_get_inv_db)):
    from .fetcher import load_config

    config = load_config(request.app.state.static_folder)
    has_alpaca = bool(config.get("alpaca_api_key"))

    global _scheduler
    last_refresh = _scheduler.last_refresh.isoformat() + "Z" if _scheduler and _scheduler.last_refresh else None
    last_error = _scheduler.last_error if _scheduler else None

    total_prices = db.query(func.count(StockPrice.id)).scalar() or 0
    total_options = db.query(func.count(OptionChainSnapshot.id)).scalar() or 0
    total_hist = db.query(func.count(OptionHistoricalBar.id)).scalar() or 0
    watchlist_count = db.query(func.count(WatchlistItem.id)).scalar() or 0

    return {
        "has_alpaca_key": has_alpaca,
        "refresh_interval_minutes": config.get("refresh_interval_minutes", 60),
        "option_symbols": config.get("option_symbols", ["SPY"]),
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

    for key in ("alpaca_api_key", "alpaca_secret_key", "refresh_interval_minutes", "option_symbols"):
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
