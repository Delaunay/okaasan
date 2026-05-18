"""API routes for Comics & Manga section."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from urllib.parse import unquote

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from fastapi.responses import Response
from sqlalchemy import func, distinct, or_
from sqlalchemy.orm import Session

from .models import Comic, ComicProgress
from .metadata import ComicVineClient, AniListClient, download_cover
from ..paths import cache_folder

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
    from .metadata import _load_api_key
    api_key = _load_api_key(static_folder) or ""
    _comicvine = ComicVineClient(api_key, cache_folder() / "comics" / "comicvine")
    _anilist = AniListClient(cache_folder() / "comics" / "anilist")


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
    import asyncio
    global _library_scanner
    if _library_scanner:
        result = await asyncio.to_thread(_library_scanner.scan_now)
    else:
        from .library import scan_folders
        from sqlalchemy import create_engine
        static_folder = request.app.state.static_folder
        private_engine = request.app.state.private_engine
        db_path = os.path.join(static_folder, "database.db")
        main_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        result = await asyncio.to_thread(scan_folders, static_folder, private_engine, main_engine)

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


# ── Aliases ────────────────────────────────────────────────────────

@router.get("/status")
def comics_status(request: Request):
    """Alias for /library/status."""
    return library_status(request)


@router.post("/configure")
async def comics_configure(request: Request):
    """Alias for /library/configure."""
    return await library_configure(request)


@router.post("/scan")
async def comics_scan(request: Request):
    """Alias for /library/scan."""
    return await library_scan(request)


# ── Aggregate endpoints ───────────────────────────────────────────

@router.get("/overview")
def comics_overview(request: Request, db: Session = Depends(_get_db)):
    """Dashboard overview with stats, continue-reading, and recently-added."""
    total_series = db.query(func.count(distinct(Comic.series))).scalar() or 0
    total_issues = db.query(func.count(Comic.id)).scalar() or 0
    read = (
        db.query(func.count(distinct(ComicProgress.comic_id)))
        .filter(ComicProgress.percent >= 95)
        .scalar() or 0
    )
    reading = (
        db.query(func.count(distinct(ComicProgress.comic_id)))
        .filter(ComicProgress.percent > 0, ComicProgress.percent < 95)
        .scalar() or 0
    )

    active = (
        db.query(Comic, ComicProgress)
        .join(ComicProgress, Comic.id == ComicProgress.comic_id)
        .filter(ComicProgress.percent > 0, ComicProgress.percent < 95)
        .order_by(ComicProgress.last_read_at.desc())
        .limit(12)
        .all()
    )
    continue_reading = []
    for comic, progress in active:
        d = comic.to_json()
        d["progress"] = progress.to_json()
        d["read_progress"] = progress.percent
        d["cover_url"] = f"/api/{comic.cover_path}" if comic.cover_path and not comic.cover_path.startswith("/") else comic.cover_path
        d["comic_type"] = comic.media_type
        d["issue_count"] = 1
        continue_reading.append(d)

    recent = db.query(Comic).order_by(Comic.created_at.desc()).limit(12).all()
    recently_added = []
    for c in recent:
        d = c.to_json()
        d["cover_url"] = f"/api/{c.cover_path}" if c.cover_path and not c.cover_path.startswith("/") else c.cover_path
        d["comic_type"] = c.media_type
        d["issue_count"] = 1
        recently_added.append(d)

    return {
        "stats": {
            "total_series": total_series,
            "total_issues": total_issues,
            "read": read,
            "reading": reading,
        },
        "continue_reading": continue_reading,
        "recently_added": recently_added,
    }


@router.get("/library")
def comics_library_view(
    request: Request,
    db: Session = Depends(_get_db),
    q: str = Query(None),
    media_type: str = Query(None, alias="type"),
):
    """Grouped series listing with optional search and type filter."""
    query = db.query(Comic)
    if q:
        query = query.filter(or_(
            Comic.series.ilike(f"%{q}%"),
            Comic.title.ilike(f"%{q}%"),
        ))
    if media_type:
        query = query.filter(Comic.media_type == media_type)

    comics = query.all()
    comic_ids = [c.id for c in comics]

    read_comic_ids: set[int] = set()
    if comic_ids:
        rows = (
            db.query(ComicProgress.comic_id)
            .filter(
                ComicProgress.comic_id.in_(comic_ids),
                ComicProgress.percent >= 95,
            )
            .all()
        )
        read_comic_ids = {r[0] for r in rows}

    series_map: dict[str, dict] = {}
    for c in comics:
        sname = c.series or c.title
        if sname not in series_map:
            cover = c.cover_path
            cover_url = f"/api/{cover}" if cover and not cover.startswith("/") else cover
            series_map[sname] = {
                "id": c.id,
                "name": sname,
                "title": sname,
                "media_type": c.media_type,
                "comic_type": c.media_type,
                "issue_count": 0,
                "read_count": 0,
                "cover_path": cover,
                "cover_url": cover_url,
                "author": c.author,
                "publisher": c.publisher,
                "year": c.year,
            }
        series_map[sname]["issue_count"] += 1
        if c.id in read_comic_ids:
            series_map[sname]["read_count"] += 1
        if not series_map[sname]["cover_path"] and c.cover_path:
            series_map[sname]["cover_path"] = c.cover_path
            series_map[sname]["cover_url"] = f"/api/{c.cover_path}" if c.cover_path and not c.cover_path.startswith("/") else c.cover_path

    series_list = sorted(series_map.values(), key=lambda s: s["name"] or "")
    return {
        "series": series_list,
        "total_series": len(series_list),
        "total_issues": sum(s["issue_count"] for s in series_list),
    }


@router.get("/series/{series_name:path}")
def comics_series_detail(
    request: Request,
    series_name: str,
    db: Session = Depends(_get_db),
):
    """All issues in a series with progress and file_id for the reader."""
    series_name = unquote(series_name)
    comics = (
        db.query(Comic)
        .filter(Comic.series == series_name)
        .order_by(Comic.issue_number)
        .all()
    )
    if not comics:
        raise HTTPException(status_code=404, detail="Series not found")

    comic_ids = [c.id for c in comics]

    progress_map: dict[int, ComicProgress] = {}
    if comic_ids:
        plist = (
            db.query(ComicProgress)
            .filter(ComicProgress.comic_id.in_(comic_ids))
            .all()
        )
        for p in plist:
            prev = progress_map.get(p.comic_id)
            if prev is None or (
                p.last_read_at
                and (not prev.last_read_at or p.last_read_at > prev.last_read_at)
            ):
                progress_map[p.comic_id] = p

    from .library_models import ComicFile
    from sqlalchemy.orm import sessionmaker
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        file_map: dict[int, int] = {}
        if comic_ids:
            rows = (
                pdb.query(ComicFile.comic_id, ComicFile.id)
                .filter(ComicFile.comic_id.in_(comic_ids))
                .all()
            )
            for cid, fid in rows:
                file_map[cid] = fid
    finally:
        pdb.close()

    issues = []
    for c in comics:
        d = c.to_json()
        p = progress_map.get(c.id)
        d["progress"] = p.to_json() if p else None
        d["file_id"] = file_map.get(c.id)
        issues.append(d)

    return {
        "series": series_name,
        "media_type": comics[0].media_type,
        "issues": issues,
    }


@router.get("/stats")
def comics_stats(request: Request, db: Session = Depends(_get_db)):
    """Detailed reading statistics."""
    total_issues = db.query(func.count(Comic.id)).scalar() or 0
    total_read = (
        db.query(func.count(distinct(ComicProgress.comic_id)))
        .filter(ComicProgress.percent >= 95)
        .scalar() or 0
    )
    total_pages_read = db.query(func.sum(ComicProgress.current_page)).scalar() or 0
    series_count = db.query(func.count(distinct(Comic.series))).scalar() or 0

    top_series_rows = (
        db.query(Comic.series, func.count(Comic.id).label("cnt"))
        .filter(Comic.series.isnot(None))
        .group_by(Comic.series)
        .order_by(func.count(Comic.id).desc())
        .limit(10)
        .all()
    )

    read_ids = {
        r[0] for r in
        db.query(ComicProgress.comic_id).filter(ComicProgress.percent >= 95).all()
    }
    all_comics = db.query(Comic.id, Comic.series).all()
    sr_map: dict[str, int] = {}
    for cid, series in all_comics:
        if series:
            sr_map.setdefault(series, 0)
            if cid in read_ids:
                sr_map[series] += 1

    top_series = [
        {"name": name, "issue_count": cnt, "read_count": sr_map.get(name, 0)}
        for name, cnt in top_series_rows
    ]

    publishers = [
        {"name": name, "count": cnt}
        for name, cnt in (
            db.query(Comic.publisher, func.count(Comic.id))
            .filter(Comic.publisher.isnot(None))
            .group_by(Comic.publisher)
            .order_by(func.count(Comic.id).desc())
            .all()
        )
    ]

    media_types = [
        {"type": mt, "count": cnt}
        for mt, cnt in (
            db.query(Comic.media_type, func.count(Comic.id))
            .group_by(Comic.media_type)
            .all()
        )
    ]

    history = (
        db.query(Comic, ComicProgress)
        .join(ComicProgress, Comic.id == ComicProgress.comic_id)
        .order_by(ComicProgress.last_read_at.desc())
        .limit(20)
        .all()
    )
    reading_history = []
    for comic, prog in history:
        d = comic.to_json()
        d["last_read_at"] = prog.last_read_at.isoformat() + "Z" if prog.last_read_at else None
        reading_history.append(d)

    return {
        "summary": {
            "total_issues": total_issues,
            "total_read": total_read,
            "total_pages_read": total_pages_read,
            "series_count": series_count,
        },
        "top_series": top_series,
        "publishers": publishers,
        "media_types": media_types,
        "reading_history": reading_history,
    }


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
    current_page = data.get("current_page", data.get("page", 0))
    total_pages = data.get("total_pages", data.get("total", 0))
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
