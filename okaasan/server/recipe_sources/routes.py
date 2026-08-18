"""Recipe-source scraper control: list sources, trigger a sync, check status."""
from __future__ import annotations

import logging
import threading

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ..recipe.models import Recipe
from ..task_registry import registry
from .images import download_images, download_ingredient_images, download_step_images
from .registry import SOURCES
from .sync import sync_source

log = logging.getLogger("okaasan.recipe_sources.routes")

router = APIRouter()

_session_factory = None  # set via configure() by server.py at startup
_running: set[str] = set()
_lock = threading.Lock()
# job key ("sync" | "images" | "ingredient_images" | "step_images") -> source -> stats/state
_last_stats: dict[str, dict[str, dict]] = {"sync": {}, "images": {}, "ingredient_images": {}, "step_images": {}}


def configure(session_factory):
    """Wire up the main DB's sessionmaker. Called once from server.py at startup."""
    global _session_factory
    _session_factory = session_factory


def get_db(request: Request):
    yield from request.app.state.get_db()


def _start_job(name: str, job_key: str, label: str, progress_fields: list[str], job_fn):
    """Run job_fn(on_progress) on a background thread, guarded against concurrent
    re-triggering of the *same* (job_key, name) pair, with task_registry + stats tracking.
    """
    running_key = f"{name}:{job_key}"
    with _lock:
        if running_key in _running:
            raise HTTPException(status_code=409, detail=f"A {label} for {name!r} is already running")
        _running.add(running_key)

    task_id = f"recipe_{job_key}:{name}"
    registry.register(task_id, f"{name.capitalize()} {label}", status="running")

    def _run():
        try:
            def on_progress(stats):
                registry.update(task_id, detail=", ".join(f"{stats[f]} {f}" for f in progress_fields))

            stats = job_fn(on_progress)
            _last_stats[job_key][name] = stats
            registry.update(task_id, status="idle", detail=f"Done: {stats}")
        except Exception as e:
            log.error("%s for %s failed: %s", label, name, e)
            registry.update(task_id, status="error", error=str(e))
        finally:
            with _lock:
                _running.discard(running_key)

    threading.Thread(target=_run, daemon=True, name=running_key).start()
    return {"status": "started", "source": name}


def _require_source(name: str):
    if name not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown recipe source {name!r}")
    if _session_factory is None:
        raise HTTPException(status_code=500, detail="Recipe source syncing is not configured")


@router.get("/recipe-sources")
def list_sources(db: Session = Depends(get_db)):
    result = []
    for name in sorted(SOURCES):
        count = db.query(Recipe).filter(Recipe.source == name).count()
        # Recipe.images defaults to [] (not NULL) for scraped recipes, so this
        # can't be a plain SQL NULL check — count non-empty lists in Python.
        image_lists = db.query(Recipe.images).filter(Recipe.source == name).all()
        with_images = sum(1 for (images,) in image_lists if images)
        result.append({
            "name": name,
            "imported_count": count,
            "with_images": with_images,
            "running": f"{name}:sync" in _running,
            "last_run": _last_stats["sync"].get(name),
            "images_running": f"{name}:images" in _running,
            "last_image_run": _last_stats["images"].get(name),
            "ingredient_images_running": f"{name}:ingredient_images" in _running,
            "last_ingredient_image_run": _last_stats["ingredient_images"].get(name),
            "step_images_running": f"{name}:step_images" in _running,
            "last_step_image_run": _last_stats["step_images"].get(name),
        })
    return result


@router.post("/recipe-sources/{name}/sync")
def trigger_sync(name: str, limit: int | None = Query(None, ge=1)):
    _require_source(name)
    return _start_job(
        name, "sync", "recipe sync", ["imported", "skipped", "failed"],
        lambda on_progress: sync_source(name, _session_factory, limit=limit, on_progress=on_progress),
    )


@router.post("/recipe-sources/{name}/download-images")
def trigger_image_download(name: str, limit: int | None = Query(None, ge=1)):
    _require_source(name)
    return _start_job(
        name, "images", "image download", ["downloaded", "skipped", "failed"],
        lambda on_progress: download_images(name, _session_factory, limit=limit, on_progress=on_progress),
    )


@router.post("/recipe-sources/{name}/download-ingredient-images")
def trigger_ingredient_image_download(name: str, limit: int | None = Query(None, ge=1)):
    _require_source(name)
    return _start_job(
        name, "ingredient_images", "ingredient image download", ["downloaded", "skipped", "failed"],
        lambda on_progress: download_ingredient_images(name, _session_factory, limit=limit, on_progress=on_progress),
    )


@router.post("/recipe-sources/{name}/download-step-images")
def trigger_step_image_download(name: str, limit: int | None = Query(None, ge=1)):
    _require_source(name)
    return _start_job(
        name, "step_images", "step image download", ["downloaded", "skipped", "failed"],
        lambda on_progress: download_step_images(name, _session_factory, limit=limit, on_progress=on_progress),
    )


@router.get("/recipe-sources/{name}/status")
def sync_status(name: str):
    if name not in SOURCES:
        raise HTTPException(status_code=404, detail=f"Unknown recipe source {name!r}")
    return {
        "name": name,
        "running": f"{name}:sync" in _running,
        "last_run": _last_stats["sync"].get(name),
        "images_running": f"{name}:images" in _running,
        "last_image_run": _last_stats["images"].get(name),
        "ingredient_images_running": f"{name}:ingredient_images" in _running,
        "last_ingredient_image_run": _last_stats["ingredient_images"].get(name),
        "step_images_running": f"{name}:step_images" in _running,
        "last_step_image_run": _last_stats["step_images"].get(name),
    }
