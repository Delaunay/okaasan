"""SQLAlchemy models for investing data — stored in a separate investing.db."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import (
    Column, Integer, Float, String, DateTime, Date, Index,
    UniqueConstraint,
)
from sqlalchemy.orm import declarative_base

InvestingBase = declarative_base()


def _utcnow():
    return datetime.now(timezone.utc)


class WatchlistItem(InvestingBase):
    __tablename__ = "watchlist"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), nullable=False, unique=True)
    name = Column(String(200), nullable=True)
    asset_type = Column(String(20), nullable=True, default="stock")
    added_at = Column(DateTime, default=_utcnow)

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "name": self.name,
            "asset_type": self.asset_type,
            "added_at": self.added_at.isoformat() + "Z" if self.added_at else None,
        }


class StockPrice(InvestingBase):
    __tablename__ = "stock_prices"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    adj_close = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("symbol", "date", name="uq_stock_price"),
        Index("idx_sp_symbol_date", "symbol", "date"),
    )

    def to_json(self) -> dict:
        return {
            "symbol": self.symbol,
            "date": self.date.isoformat() if self.date else None,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "adj_close": self.adj_close,
        }


class OptionChainSnapshot(InvestingBase):
    __tablename__ = "option_chain_snapshots"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), nullable=False, index=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    snapshot_time = Column(String(10), nullable=True)  # "open" | "midday" | "close" | None (legacy)
    underlying_price = Column(Float, nullable=True)
    expiration = Column(Date, nullable=False)
    strike = Column(Float, nullable=False)
    option_type = Column(String(4), nullable=False)  # call / put
    bid = Column(Float, nullable=True)
    ask = Column(Float, nullable=True)
    last = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    open_interest = Column(Float, nullable=True)
    implied_volatility = Column(Float, nullable=True)
    delta = Column(Float, nullable=True)
    gamma = Column(Float, nullable=True)
    theta = Column(Float, nullable=True)
    vega = Column(Float, nullable=True)
    rho = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "symbol", "snapshot_date", "snapshot_time", "expiration", "strike", "option_type",
            name="uq_option_snap_v2",
        ),
        Index("idx_ocs_sym_date", "symbol", "snapshot_date"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "symbol": self.symbol,
            "snapshot_date": self.snapshot_date.isoformat() if self.snapshot_date else None,
            "snapshot_time": self.snapshot_time,
            "underlying_price": self.underlying_price,
            "expiration": self.expiration.isoformat() if self.expiration else None,
            "days_to_expiration": (self.expiration - date.today()).days if self.expiration else None,
            "strike": self.strike,
            "option_type": self.option_type,
            "bid": self.bid,
            "ask": self.ask,
            "last": self.last,
            "volume": self.volume,
            "open_interest": self.open_interest,
            "implied_volatility": self.implied_volatility,
            "delta": self.delta,
            "gamma": self.gamma,
            "theta": self.theta,
            "vega": self.vega,
            "rho": self.rho,
        }


class OptionHistoricalBar(InvestingBase):
    __tablename__ = "option_historical_bars"

    id = Column(Integer, primary_key=True)
    option_symbol = Column(String(30), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False)
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)
    vwap = Column(Float, nullable=True)
    trade_count = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("option_symbol", "timestamp", name="uq_option_bar"),
        Index("idx_ohb_symbol_ts", "option_symbol", "timestamp"),
    )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "option_symbol": self.option_symbol,
            "timestamp": self.timestamp.isoformat() + "Z" if self.timestamp else None,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "vwap": self.vwap,
            "trade_count": self.trade_count,
        }


class IntradayPrice(InvestingBase):
    """Intraday OHLCV bars fetched from yfinance and accumulated locally."""
    __tablename__ = "intraday_prices"

    id = Column(Integer, primary_key=True)
    symbol = Column(String(20), nullable=False, index=True)
    timestamp = Column(DateTime, nullable=False, index=True)
    interval = Column(String(5), nullable=False, default="5m")  # 1m, 5m, 15m, 1h
    open = Column(Float, nullable=True)
    high = Column(Float, nullable=True)
    low = Column(Float, nullable=True)
    close = Column(Float, nullable=True)
    volume = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("symbol", "timestamp", "interval", name="uq_intraday_price"),
        Index("idx_intraday_sym_ts", "symbol", "timestamp"),
    )

    def to_json(self) -> dict:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp.isoformat() + "Z" if self.timestamp else None,
            "interval": self.interval,
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
        }


class EconomicSeries(InvestingBase):
    """Cached time-series data from FRED / Bank of Canada / other sources."""
    __tablename__ = "economic_series"

    id = Column(Integer, primary_key=True)
    series_id = Column(String(60), nullable=False, index=True)
    source = Column(String(20), nullable=False, default="fred")
    date = Column(Date, nullable=False)
    value = Column(Float, nullable=True)

    __table_args__ = (
        UniqueConstraint("series_id", "date", name="uq_econ_series_date"),
        Index("idx_econ_series_date", "series_id", "date"),
    )

    def to_json(self) -> dict:
        return {
            "date": self.date.isoformat() if self.date else None,
            "value": self.value,
        }
