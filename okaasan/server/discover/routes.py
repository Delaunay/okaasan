"""Discover routes — torrent search + DHT crawler control."""

from __future__ import annotations

from traceback import print_exc
from typing import TYPE_CHECKING

import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, sessionmaker

from .models import DiscoverBase, SearchResult, DHTTorrent, IndexerConfig

if TYPE_CHECKING:
    from sqlalchemy.engine import Engine

router = APIRouter()
_discover_engine: Engine | None = None


def _get_db():
    Session = sessionmaker(bind=_discover_engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


# ---------- Search ----------

@router.get("/discover/search")
async def search_torrents(
    q: str = Query(..., min_length=1),
    categories: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(_get_db),
):
    from . import search as search_module

    try:
        cats = None
        if categories:
            cats = [int(c.strip()) for c in categories.split(",") if c.strip()]

        results = await search_module.search(q, categories=cats, db=db, limit=limit)
        return {"query": q, "count": len(results), "results": results}
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discover/search/stream")
async def search_torrents_stream(
    q: str = Query(..., min_length=1),
    categories: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(_get_db),
):
    from . import search as search_module

    cats = None
    if categories:
        cats = [int(c.strip()) for c in categories.split(",") if c.strip()]

    async def event_generator():
        total = 0
        try:
            async for indexer_id, results in search_module.search_stream(
                q, categories=cats, db=db, limit=limit
            ):
                total += len(results)
                payload = json.dumps({
                    "indexer": indexer_id,
                    "count": len(results),
                    "total": total,
                    "results": results,
                })
                yield f"data: {payload}\n\n"
        except Exception as exc:
            error_payload = json.dumps({"error": str(exc)})
            yield f"data: {error_payload}\n\n"

        yield f"data: {json.dumps({'done': True, 'total': total})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/discover/resolve")
async def resolve_download(request: Request):
    try:
        data = await request.json()
        indexer_id = data.get("indexer_id")
        details_url = data.get("details_url")
        if not indexer_id or not details_url:
            raise HTTPException(status_code=400, detail="indexer_id and details_url required")

        from . import search as search_module
        link = await search_module.resolve_download(indexer_id, details_url)
        if link is None:
            raise HTTPException(status_code=404, detail="Could not resolve download link")
        return {"link": link}
    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Indexer config ----------

@router.get("/discover/indexers")
def list_indexers(db: Session = Depends(_get_db)):
    from . import search as search_module

    try:
        available = search_module.list_available()
        configured = {c["id"] for c in search_module.list_configured()}

        db_configs = {
            c.indexer_id: c
            for c in db.query(IndexerConfig).all()
        }

        result = []
        for idx in available:
            idx_id = idx.get("id", "")
            db_cfg = db_configs.get(idx_id)
            result.append({
                "id": idx_id,
                "name": idx.get("name", idx_id),
                "language": idx.get("language", ""),
                "type": idx.get("type", ""),
                "enabled": db_cfg.enabled if db_cfg else False,
                "configured": idx_id in configured,
            })
        return result
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/discover/indexers/configure")
async def configure_indexer(request: Request, db: Session = Depends(_get_db)):
    from . import search as search_module

    try:
        data = await request.json()
        indexer_id = data.get("indexer_id")
        enabled = data.get("enabled", True)
        config = data.get("config", {})

        if not indexer_id:
            raise HTTPException(status_code=400, detail="indexer_id required")

        existing = (
            db.query(IndexerConfig)
            .filter(IndexerConfig.indexer_id == indexer_id)
            .first()
        )
        if existing:
            existing.enabled = enabled
            existing.config = config
        else:
            existing = IndexerConfig(
                indexer_id=indexer_id, enabled=enabled, config=config
            )
            db.add(existing)
        db.commit()

        if enabled:
            ok = await search_module.configure_indexer(indexer_id, config)
            return {"indexer_id": indexer_id, "enabled": True, "configured": ok}
        else:
            return {"indexer_id": indexer_id, "enabled": False, "configured": False}

    except HTTPException:
        raise
    except Exception as e:
        print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- DHT Crawler ----------

@router.post("/discover/crawler/start")
def crawler_start():
    from .crawler import get_crawler

    crawler = get_crawler()
    if crawler is None:
        raise HTTPException(status_code=503, detail="Crawler not initialized")
    if crawler.running:
        return {"status": "already_running"}
    crawler.start()
    return {"status": "started"}


@router.post("/discover/crawler/stop")
def crawler_stop():
    from .crawler import get_crawler

    crawler = get_crawler()
    if crawler is None:
        raise HTTPException(status_code=503, detail="Crawler not initialized")
    if not crawler.running:
        return {"status": "already_stopped"}
    crawler.stop()
    return {"status": "stopped"}


@router.get("/discover/crawler/status")
def crawler_status():
    from .crawler import get_crawler

    crawler = get_crawler()
    if crawler is None:
        return {"running": False, "discovered": 0, "metadata_resolved": 0}
    return crawler.status()


@router.get("/discover/crawler/results")
def crawler_results(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    resolved_only: bool = Query(False),
    db: Session = Depends(_get_db),
):
    try:
        query = db.query(DHTTorrent).order_by(DHTTorrent.discovered_at.desc())
        if resolved_only:
            query = query.filter(DHTTorrent.metadata_resolved == True)
        total = query.count()
        rows = query.offset(offset).limit(limit).all()
        return {
            "total": total,
            "offset": offset,
            "limit": limit,
            "results": [r.to_json() for r in rows],
        }
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/discover/crawler/detail/{torrent_id}")
def crawler_torrent_detail(
    torrent_id: int,
    db: Session = Depends(_get_db),
):
    torrent = db.query(DHTTorrent).filter(DHTTorrent.id == torrent_id).first()
    if not torrent:
        raise HTTPException(status_code=404, detail="Torrent not found")
    return torrent.to_json(include_detail=True)


@router.delete("/discover/crawler/{torrent_id}")
def crawler_delete_torrent(
    torrent_id: int,
    db: Session = Depends(_get_db),
):
    torrent = db.query(DHTTorrent).filter(DHTTorrent.id == torrent_id).first()
    if not torrent:
        raise HTTPException(status_code=404, detail="Torrent not found")
    db.delete(torrent)
    db.commit()
    return {"deleted": torrent_id}


@router.post("/discover/crawler/cleanup")
def crawler_cleanup(db: Session = Depends(_get_db)):
    count = db.query(DHTTorrent).filter(DHTTorrent.metadata_resolved == False).delete()
    db.commit()
    return {"deleted": count}


@router.get("/discover/history")
def search_history(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(_get_db),
):
    try:
        rows = (
            db.query(SearchResult)
            .order_by(SearchResult.searched_at.desc())
            .limit(limit)
            .all()
        )
        return [r.to_json() for r in rows]
    except Exception as e:
        print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ---------- Router factory ----------

def create_discover_router(discover_engine: "Engine") -> APIRouter:
    global _discover_engine
    _discover_engine = discover_engine

    DiscoverBase.metadata.create_all(bind=discover_engine)

    from .crawler import init_crawler
    init_crawler(discover_engine)

    # Eagerly configure saved indexers
    try:
        from . import search as search_module
        Session = sessionmaker(bind=discover_engine)
        db = Session()
        try:
            configured = search_module.configure_from_db(db)
            if configured:
                import logging
                logging.getLogger(__name__).info(
                    "Pre-configured %d indexers: %s", len(configured), configured
                )
        finally:
            db.close()
    except Exception:
        pass

    return router
