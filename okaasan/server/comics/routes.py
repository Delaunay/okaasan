"""API routes for Comics & Manga section."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from .models import Comic, ComicProgress
from .metadata import ComicVineClient, AniListClient, download_cover

log = logging.getLogger("okaasan.comics")

router = APIRouter(prefix="/comics", tags=["comics"])

_comicvine: ComicVineClient | None = None
_anilist: AniListClient | None = None
_library_scanner = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


def _get_private_db(request: Request):
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=request.app.state.private_engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


def _init_clients(static_folder: str):
    global _comicvine, _anilist
    base = Path(static_folder)
    cv_cache = base / "uploads" / "data" / "comics" / "cv_cache"
    al_cache = base / "uploads" / "data" / "comics" / "al_cache"

    from .metadata import _load_api_key
    api_key = _load_api_key(static_folder) or ""
    _comicvine = ComicVineClient(api_key, cv_cache)
    _anilist = AniListClient(al_cache)


def _get_comicvine(request: Request) -> ComicVineClient:
    global _comicvine
    if _comicvine is None:
        _init_clients(request.app.state.static_folder)
    return _comicvine


def _get_anilist(request: Request) -> AniListClient:
    global _anilist
    if _anilist is None:
        _init_clients(request.app.state.static_folder)
    return _anilist


# ── Library management ─────────────────────────────────────────────

@router.get("/library/status")
def library_status(request: Request):
    """Get comic library scan status and stats."""
    from .library import load_config
    from .library_models import ComicFile
    from sqlalchemy.orm import sessionmaker

    config = load_config(request.app.state.static_folder)
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        total = db.query(ComicFile).count()
        matched = db.query(ComicFile).filter_by(matched=True).count()
    finally:
        db.close()

    global _library_scanner
    last_scan = _library_scanner.last_scan.isoformat() + "Z" if _library_scanner and _library_scanner.last_scan else None

    return {
        "configured": bool(config.get("folders")),
        "folders": config.get("folders", []),
        "total_files": total,
        "matched_files": matched,
        "unmatched_files": total - matched,
        "last_scan": last_scan,
        "scan_interval_minutes": config.get("scan_interval_minutes", 60),
    }


@router.post("/library/configure")
async def library_configure(request: Request):
    """Save comic library folder configuration."""
    from .library import save_config, load_config
    data = await request.json()

    config = load_config(request.app.state.static_folder)
    if "folders" in data:
        config["folders"] = data["folders"]
    if "scan_interval_minutes" in data:
        config["scan_interval_minutes"] = data["scan_interval_minutes"]
    if "extensions" in data:
        config["extensions"] = data["extensions"]

    save_config(request.app.state.static_folder, config)
    return {"message": "Configuration saved", "config": config}


@router.post("/library/scan")
async def library_scan(request: Request):
    """Trigger a manual comic library scan."""
    from .library import scan_folders
    from sqlalchemy import create_engine

    static_folder = request.app.state.static_folder
    private_engine = request.app.state.private_engine

    db_path = os.path.join(static_folder, "database.db")
    main_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    result = scan_folders(static_folder, private_engine, main_engine)

    global _library_scanner
    if _library_scanner:
        _library_scanner.last_scan = datetime.now(timezone.utc)
        _library_scanner.last_result = result

    return {"message": "Scan complete", **result}


@router.get("/library/all-files")
def library_all_files(request: Request):
    """Get all comic library files."""
    from .library_models import ComicFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        files = pdb.query(ComicFile).order_by(
            ComicFile.series, ComicFile.issue_number
        ).all()
        return {"files": [f.to_json() for f in files]}
    finally:
        pdb.close()


# ── Comic CRUD ─────────────────────────────────────────────────────

@router.get("/list")
def list_comics(request: Request, db: Session = Depends(_get_db)):
    """List all comics with their reading progress."""
    comics = db.query(Comic).order_by(Comic.series, Comic.issue_number).all()
    result = []
    for c in comics:
        data = c.to_json()
        latest_progress = (
            db.query(ComicProgress)
            .filter_by(comic_id=c.id)
            .order_by(ComicProgress.last_read_at.desc())
            .first()
        )
        data["progress"] = latest_progress.to_json() if latest_progress else None
        result.append(data)
    return result


@router.get("/detail/{comic_id}")
def get_comic(request: Request, comic_id: int, db: Session = Depends(_get_db)):
    """Get a single comic with full details."""
    comic = db.query(Comic).filter_by(id=comic_id).first()
    if not comic:
        raise HTTPException(status_code=404, detail="Comic not found")

    data = comic.to_json()
    progress = (
        db.query(ComicProgress)
        .filter_by(comic_id=comic.id)
        .order_by(ComicProgress.last_read_at.desc())
        .first()
    )
    data["progress"] = progress.to_json() if progress else None

    from .library_models import ComicFile
    from sqlalchemy.orm import sessionmaker
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        files = pdb.query(ComicFile).filter_by(comic_id=comic.id).all()
        data["files"] = [f.to_json() for f in files]
    finally:
        pdb.close()

    return data


# ── Metadata search ────────────────────────────────────────────────

@router.get("/search")
def search_metadata(
    request: Request,
    q: str = Query(..., min_length=1),
    source: str = Query("comicvine"),
):
    """Search ComicVine or AniList for comic/manga metadata."""
    if source == "comicvine":
        cv = _get_comicvine(request)
        if not cv.available:
            raise HTTPException(status_code=503, detail="ComicVine API key not configured")
        results = cv.search_comicvine(q)
        return {"source": "comicvine", "results": results}

    elif source == "anilist":
        al = _get_anilist(request)
        results = al.search_anilist(q)
        return {"source": "anilist", "results": results}

    else:
        raise HTTPException(status_code=400, detail="source must be 'comicvine' or 'anilist'")


# ── Reader ─────────────────────────────────────────────────────────

@router.get("/read/{file_id}/info")
def reader_info(request: Request, file_id: int):
    """Get page count and metadata for a comic file."""
    from .library_models import ComicFile
    from .reader import get_page_count
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        cf = pdb.query(ComicFile).filter_by(id=file_id).first()
        if not cf:
            raise HTTPException(status_code=404, detail="File not found")
        file_path = cf.file_path
        file_data = cf.to_json()
    finally:
        pdb.close()

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    page_count = get_page_count(file_path)
    return {
        **file_data,
        "page_count": page_count,
    }


@router.get("/read/{file_id}/page/{page_num}")
def reader_page(request: Request, file_id: int, page_num: int):
    """Serve a single page image from a comic file."""
    from .library_models import ComicFile
    from .reader import get_page
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        cf = pdb.query(ComicFile).filter_by(id=file_id).first()
        if not cf:
            raise HTTPException(status_code=404, detail="File not found")
        file_path = cf.file_path
    finally:
        pdb.close()

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    result = get_page(file_path, page_num)
    if result is None:
        raise HTTPException(status_code=404, detail="Page not found")

    image_bytes, content_type = result
    return Response(content=image_bytes, media_type=content_type)


# ── Reading progress ──────────────────────────────────────────────

@router.post("/{comic_id}/progress")
async def save_progress(request: Request, comic_id: int, db: Session = Depends(_get_db)):
    """Save reading position for a comic."""
    comic = db.query(Comic).filter_by(id=comic_id).first()
    if not comic:
        raise HTTPException(status_code=404, detail="Comic not found")

    data = await request.json()
    current_page = data.get("current_page", 0)
    total_pages = data.get("total_pages", 0)
    percent = (current_page / total_pages * 100) if total_pages > 0 else 0.0

    existing = (
        db.query(ComicProgress)
        .filter_by(comic_id=comic_id)
        .order_by(ComicProgress.last_read_at.desc())
        .first()
    )
    if existing:
        existing.current_page = current_page
        existing.total_pages = total_pages
        existing.percent = percent
        existing.last_read_at = datetime.now(timezone.utc)
    else:
        existing = ComicProgress(
            comic_id=comic_id,
            current_page=current_page,
            total_pages=total_pages,
            percent=percent,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)
    return existing.to_json()


@router.get("/{comic_id}/progress")
def get_progress(request: Request, comic_id: int, db: Session = Depends(_get_db)):
    """Get reading position for a comic."""
    comic = db.query(Comic).filter_by(id=comic_id).first()
    if not comic:
        raise HTTPException(status_code=404, detail="Comic not found")

    progress = (
        db.query(ComicProgress)
        .filter_by(comic_id=comic_id)
        .order_by(ComicProgress.last_read_at.desc())
        .first()
    )
    if not progress:
        return {"comic_id": comic_id, "current_page": 0, "total_pages": 0, "percent": 0.0, "last_read_at": None}
    return progress.to_json()
