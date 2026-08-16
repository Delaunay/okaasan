"""Recipe-source scraper control: list sources, trigger a sync, check status."""
from __future__ import annotations

import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..recipe.models import Recipe
from ..task_registry import registry
from .registry import SOURCES
from .sync import sync_source

log = logging.getLogger("okaasan.recipe_sources.routes")

router = APIRouter()

_session_factory = None  # set via configure() by server.py at startup
_running: set[str] = set()
_lock = threading.Lock()
_last_stats: dict[str, dict] = {}


def configure(session_factory):
    """Wire up the main DB's sessionmaker. Called once from server.py at startup."""
    global _session_factory
    _session_factory = session_factory


def get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/recipe-sources")
def list_sources(db: Session = Depends(get_db)):
    result = []
    for name in sorted(SOURCES):
        count = db.query(Recipe).filter(Recipe.source == name).count()
        result.append({
            "name": name,
            "imported_count": count,
            "running": name in _running,
            "last_run": _last_stats.get(name),
        })
    return result


@router.post("/recipe-sources/{name}/sync")
def trigger_sync(name: str, limit: int | None = Query(None, ge=1)):
    if name not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown recipe source {name!r}")
    if _session_factory is None:
        raise HTTPException(status_code=500, detail="Recipe source syncing is not configured")

    with _lock:
        if name in _running:
            raise HTTPException(status_code=409, detail=f"A sync for {name!r} is already running")
        _running.add(name)

    task_id = f"recipe_sync:{name}"
    registry.register(task_id, f"{name.capitalize()} recipe sync", status="running")

    def _run():
        try:
            def on_progress(stats):
                registry.update(
                    task_id,
                    detail=f"{stats['imported']} imported, {stats['skipped']} skipped, {stats['failed']} failed",
                )

            stats = sync_source(name, _session_factory, limit=limit, on_progress=on_progress)
            _last_stats[name] = stats
            registry.update(task_id, status="idle", detail=f"Done: {stats}")
        except Exception as e:
            log.error("Recipe sync for %s failed: %s", name, e)
            registry.update(task_id, status="error", error=str(e))
        finally:
            with _lock:
                _running.discard(name)

    threading.Thread(target=_run, daemon=True, name=f"recipe-sync-{name}").start()
    return {"status": "started", "source": name}


@router.get("/recipe-sources/{name}/status")
def sync_status(name: str):
    if name not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown recipe source {name!r}")
    return {
        "name": name,
        "running": name in _running,
        "last_run": _last_stats.get(name),
    }
