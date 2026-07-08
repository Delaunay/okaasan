"""API routes for inspecting social media data dumps."""
from __future__ import annotations

import logging
import mimetypes

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .config import (
    PLATFORMS,
    default_dump_dir,
    get_dump_dir,
    load_config,
    save_config,
)
from .dump_reader import DumpExplorer

log = logging.getLogger("okaasan.socials")

router = APIRouter(prefix="/socials", tags=["socials"])

_PLATFORM_LABELS = {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "linkedin": "LinkedIn",
}


def _explorer(platform: str) -> DumpExplorer:
    if platform not in PLATFORMS:
        raise HTTPException(404, f"Unknown platform: {platform}")
    dump_dir = get_dump_dir(platform)
    if dump_dir is None:
        raise HTTPException(404, f"No dump configured for {platform}")
    return DumpExplorer(dump_dir, platform)


class SocialsConfigUpdate(BaseModel):
    dumps: dict[str, str] = {}


@router.get("/overview")
def socials_overview():
    """Summary of configured platforms and available dump categories."""
    platforms = []
    for pid in PLATFORMS:
        dump_dir = get_dump_dir(pid)
        entry = {
            "id": pid,
            "name": _PLATFORM_LABELS[pid],
            "configured": dump_dir is not None,
            "dump_path": str(dump_dir) if dump_dir else None,
            "default_path": str(default_dump_dir(pid)),
            "categories": 0,
        }
        if dump_dir:
            explorer = DumpExplorer(dump_dir, pid)
            cats = explorer.get_categories()
            entry["categories"] = len(cats)
        platforms.append(entry)
    return {"platforms": platforms}


@router.get("/config")
def get_socials_config():
    cfg = load_config()
    dumps = cfg.get("dumps", {})
    return {
        "dumps": {
            pid: {
                "path": dumps.get(pid, ""),
                "default_path": str(default_dump_dir(pid)),
                "configured": get_dump_dir(pid) is not None,
            }
            for pid in PLATFORMS
        }
    }


@router.put("/config")
def update_socials_config(body: SocialsConfigUpdate):
    cfg = load_config()
    cfg["dumps"] = {k: v.strip() for k, v in body.dumps.items() if v.strip()}
    save_config(cfg)
    return get_socials_config()


@router.get("/{platform}/categories")
def list_categories(platform: str):
    explorer = _explorer(platform)
    return {
        "platform": platform,
        "name": _PLATFORM_LABELS[platform],
        "dump_path": str(explorer.root),
        "categories": explorer.get_categories(),
    }


@router.get("/{platform}/items")
def list_items(
    platform: str,
    category: str = Query(..., description="Category folder path within the dump"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = Query(None),
):
    explorer = _explorer(platform)
    return explorer.load_items(category, page=page, per_page=per_page, search=search)


@router.get("/{platform}/items/{item_id}")
def get_item(
    platform: str,
    item_id: str,
    category: str = Query(..., description="Category folder path within the dump"),
):
    explorer = _explorer(platform)
    item = explorer.get_item(category, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


@router.get("/{platform}/media")
def serve_media(
    platform: str,
    path: str = Query(..., description="Relative media path inside the dump"),
):
    dump_dir = get_dump_dir(platform)
    if dump_dir is None:
        raise HTTPException(404, f"No dump configured for {platform}")
    if ".." in path or path.startswith("/"):
        raise HTTPException(400, "Invalid media path")
    target = (dump_dir / path).resolve()
    root = dump_dir.resolve()
    if not str(target).startswith(str(root)):
        raise HTTPException(403, "Access denied")
    if not target.is_file():
        raise HTTPException(404, "Media not found")
    mime, _ = mimetypes.guess_type(str(target))
    return FileResponse(target, media_type=mime or "application/octet-stream")
