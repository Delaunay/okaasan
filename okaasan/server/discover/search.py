"""Pyackett wrapper — singleton indexer search with result caching."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import sessionmaker, Session

from .models import SearchResult, IndexerConfig

log = logging.getLogger(__name__)

_pyackett_instance = None
_definitions_loaded = False


def _get_pyackett():
    global _pyackett_instance, _definitions_loaded
    if _pyackett_instance is None:
        from pyackett import Pyackett
        _pyackett_instance = Pyackett()
    if not _definitions_loaded:
        _pyackett_instance.load_definitions_from_github(source="jackett")
        _definitions_loaded = True
    return _pyackett_instance


def configure_from_db(db: Session) -> list[str]:
    """Load enabled indexer configs from DB and configure the Pyackett instance.

    Returns list of successfully configured indexer IDs.
    """
    pk = _get_pyackett()
    configs = db.query(IndexerConfig).filter(IndexerConfig.enabled == True).all()
    configured = []
    for cfg in configs:
        try:
            ok = asyncio.get_event_loop().run_until_complete(
                pk.configure_indexer(cfg.indexer_id, cfg.config or {})
            )
            if ok:
                configured.append(cfg.indexer_id)
        except RuntimeError:
            loop = asyncio.new_event_loop()
            ok = loop.run_until_complete(
                pk.configure_indexer(cfg.indexer_id, cfg.config or {})
            )
            loop.close()
            if ok:
                configured.append(cfg.indexer_id)
        except Exception as exc:
            log.warning("Failed to configure indexer %s: %s", cfg.indexer_id, exc)
    return configured


async def configure_indexer(indexer_id: str, config: dict[str, Any] | None = None) -> bool:
    pk = _get_pyackett()
    return await pk.configure_indexer(indexer_id, config or {})


def list_available() -> list[dict[str, str]]:
    pk = _get_pyackett()
    return pk.list_available()


def list_configured() -> list[dict[str, str]]:
    pk = _get_pyackett()
    return pk.list_configured()


def _release_to_dict(r, query: str) -> dict:
    return {
        "title": r.title,
        "infohash": r.info_hash,
        "magnet": r.magnet_uri,
        "download_url": r.link,
        "seeders": r.seeders,
        "leechers": r.peers,
        "size": r.size,
        "category": ",".join(str(c) for c in r.category) if r.category else None,
        "indexer": r.origin_name,
        "indexer_id": r.origin_id,
        "details_url": r.details,
        "published_at": r.publish_date.isoformat() if r.publish_date else None,
        "query": query,
    }


async def search(
    query: str,
    categories: list[int] | None = None,
    db: Session | None = None,
    limit: int = 100,
) -> list[dict]:
    """Search configured indexers and optionally cache results."""
    pk = _get_pyackett()
    results = await pk.search(query, categories=categories, limit=limit)

    out = [_release_to_dict(r, query) for r in results]

    if db is not None:
        _cache_results(db, query, out)

    return out


async def search_stream(
    query: str,
    categories: list[int] | None = None,
    db: Session | None = None,
    limit: int = 100,
):
    """Async generator that yields (indexer_id, results) as each indexer completes."""
    from pyackett.core.models import TorznabQuery

    pk = _get_pyackett()
    manager = pk.manager
    targets = manager.configured_indexers

    if not targets:
        return

    tq = TorznabQuery(search_term=query)
    if categories:
        tq.categories = categories
    tq.limit = limit

    async def _search_one(indexer_id: str, indexer):
        try:
            results = await indexer.search(tq)
            return indexer_id, results
        except Exception as exc:
            log.debug("Search failed for %s: %s", indexer_id, exc)
            return indexer_id, []

    tasks = [
        asyncio.ensure_future(_search_one(iid, idx))
        for iid, idx in targets.items()
    ]

    all_results = []
    for coro in asyncio.as_completed(tasks):
        indexer_id, results = await coro
        items = [_release_to_dict(r, query) for r in results]
        all_results.extend(items)
        yield indexer_id, items

    if db is not None:
        _cache_results(db, query, all_results)


async def resolve_download(indexer_id: str, details_url: str) -> str | None:
    pk = _get_pyackett()
    return await pk.resolve_download(indexer_id, details_url)


def _cache_results(db: Session, query: str, results: list[dict]):
    """Persist search results to the discover DB for history/dedup."""
    now = datetime.now(timezone.utc)
    for item in results:
        try:
            pub = None
            if item.get("published_at"):
                pub = datetime.fromisoformat(item["published_at"])

            row = SearchResult(
                title=item["title"],
                infohash=item.get("infohash"),
                magnet=item.get("magnet"),
                download_url=item.get("download_url"),
                seeders=item.get("seeders"),
                leechers=item.get("leechers"),
                size=item.get("size"),
                category=item.get("category"),
                indexer=item.get("indexer"),
                indexer_id=item.get("indexer_id"),
                details_url=item.get("details_url"),
                published_at=pub,
                searched_at=now,
                query=query,
            )
            db.add(row)
        except Exception:
            log.debug("Failed to cache result: %s", item.get("title"), exc_info=True)
    try:
        db.commit()
    except Exception:
        db.rollback()
        log.warning("Failed to commit cached search results", exc_info=True)
