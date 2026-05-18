"""API routes for Audiobooks section."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Depends, Query
from sqlalchemy.orm import Session, sessionmaker

from .models import Audiobook, AudiobookChapter, ListeningProgress

log = logging.getLogger("okaasan.audiobooks")

router = APIRouter(prefix="/audiobooks", tags=["audiobooks"])

_library_scanner = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


def _get_private_db(request: Request):
    Session_ = sessionmaker(bind=request.app.state.private_engine)
    db = Session_()
    try:
        yield db
    finally:
        db.close()


# ── Library endpoints ──────────────────────────────────────────────

@router.get("/library/status")
def library_status(request: Request):
    """Get audiobook library scan status and stats."""
    from .library import load_config
    from .library_models import AudiobookFile

    config = load_config(request.app.state.static_folder)
    Session_ = sessionmaker(bind=request.app.state.private_engine)
    db = Session_()
    try:
        total = db.query(AudiobookFile).count()
        matched = db.query(AudiobookFile).filter_by(matched=True).count()
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
    """Save audiobook library folder configuration."""
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
    """Trigger a manual audiobook library scan."""
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
    """Get all audiobook library files."""
    from .library_models import AudiobookFile

    Session_ = sessionmaker(bind=request.app.state.private_engine)
    pdb = Session_()
    try:
        files = pdb.query(AudiobookFile).order_by(
            AudiobookFile.author, AudiobookFile.title
        ).all()
        return {"files": [f.to_json() for f in files]}
    finally:
        pdb.close()


# ── Audiobook CRUD ─────────────────────────────────────────────────

@router.get("/list")
def list_audiobooks(request: Request, db: Session = Depends(_get_db)):
    """List all audiobooks with progress info."""
    books = db.query(Audiobook).order_by(Audiobook.title).all()
    result = []
    for book in books:
        data = book.to_json()
        if book.progress:
            data["progress"] = book.progress.to_json()
        else:
            data["progress"] = None
        result.append(data)
    return result


# ── Overview, Library, Stats & Aliases ─────────────────────────────

@router.get("/overview")
def audiobooks_overview(request: Request, db: Session = Depends(_get_db)):
    """Dashboard overview: stats, continue listening, recently added."""
    from .library_models import AudiobookFile
    from sqlalchemy import func

    total = db.query(func.count(Audiobook.id)).scalar() or 0
    audiobooks = db.query(Audiobook).all()

    listening = 0
    completed = 0
    total_listen_time_ms = 0
    continue_items = []

    for ab in audiobooks:
        p = ab.progress
        if not p:
            continue
        total_listen_time_ms += p.position_ms or 0
        dur = ab.duration_ms or 0
        if dur > 0 and (p.position_ms or 0) >= dur * 0.95:
            completed += 1
        elif (p.position_ms or 0) > 0:
            listening += 1
            continue_items.append((ab, p))

    continue_items.sort(
        key=lambda x: x[1].last_listened_at or datetime.min,
        reverse=True,
    )
    continue_items = continue_items[:12]

    ab_ids = [ab.id for ab, _ in continue_items]
    Session_ = sessionmaker(bind=request.app.state.private_engine)
    pdb = Session_()
    try:
        files = (
            pdb.query(AudiobookFile)
            .filter(AudiobookFile.audiobook_id.in_(ab_ids))
            .all()
        ) if ab_ids else []
        file_map = {}
        for f in files:
            if f.audiobook_id not in file_map:
                file_map[f.audiobook_id] = f
    finally:
        pdb.close()

    continue_listening = []
    for ab, p in continue_items:
        data = ab.to_json()
        data["progress"] = p.to_json()
        af = file_map.get(ab.id)
        data["file_id"] = af.id if af else None
        data["duration_seconds"] = (ab.duration_ms or 0) / 1000.0
        data["progress_seconds"] = (p.position_ms or 0) / 1000.0
        dur = ab.duration_ms or 1
        data["progress_percent"] = min(100.0, ((p.position_ms or 0) / dur) * 100)
        data["chapter_count"] = ab.chapter_count or 0
        data["added_at"] = ab.created_at.isoformat() + "Z" if ab.created_at else None
        continue_listening.append(data)

    recently_added = []
    for ab in db.query(Audiobook).order_by(Audiobook.created_at.desc()).limit(12).all():
        data = ab.to_json()
        data["duration_seconds"] = (ab.duration_ms or 0) / 1000.0
        data["progress_seconds"] = 0
        data["progress_percent"] = 0
        data["chapter_count"] = ab.chapter_count or 0
        data["added_at"] = ab.created_at.isoformat() + "Z" if ab.created_at else None
        recently_added.append(data)

    return {
        "stats": {
            "total_audiobooks": total,
            "total_books": total,
            "listening": listening,
            "in_progress": listening,
            "completed": completed,
            "total_listen_time_ms": total_listen_time_ms,
            "total_listen_time_seconds": total_listen_time_ms / 1000.0,
        },
        "continue_listening": continue_listening,
        "recently_added": recently_added,
    }


@router.get("/library")
def audiobooks_library(
    request: Request,
    q: str = Query(None),
    status: str = Query(None),
    db: Session = Depends(_get_db),
):
    """Filterable audiobook library listing."""
    from .library_models import AudiobookFile

    query = db.query(Audiobook)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            Audiobook.title.ilike(pattern)
            | Audiobook.author.ilike(pattern)
            | Audiobook.narrator.ilike(pattern)
        )

    audiobooks = query.order_by(Audiobook.title).all()
    ab_ids = [ab.id for ab in audiobooks]

    Session_ = sessionmaker(bind=request.app.state.private_engine)
    pdb = Session_()
    try:
        files = (
            pdb.query(AudiobookFile)
            .filter(AudiobookFile.audiobook_id.in_(ab_ids))
            .all()
        ) if ab_ids else []
        file_map = {}
        for f in files:
            if f.audiobook_id not in file_map:
                file_map[f.audiobook_id] = f
    finally:
        pdb.close()

    result = []
    for ab in audiobooks:
        p = ab.progress
        pos = (p.position_ms or 0) if p else 0
        dur = ab.duration_ms or 0

        if dur > 0 and pos >= dur * 0.95:
            ab_status = "completed"
        elif pos > 0:
            ab_status = "listening"
        else:
            ab_status = "unstarted"

        if status and ab_status != status:
            continue

        pct = round((pos / dur) * 100, 1) if dur > 0 else 0
        data = ab.to_json()
        data["status"] = ab_status
        data["progress_percent"] = pct
        data["duration_seconds"] = dur / 1000.0
        data["progress_seconds"] = pos / 1000.0
        data["chapter_count"] = ab.chapter_count or 0
        data["current_chapter"] = p.chapter_number if p else 0
        data["completed"] = ab_status == "completed"
        af = file_map.get(ab.id)
        data["file_id"] = af.id if af else None
        result.append(data)

    return {"books": result, "audiobooks": result, "total": len(result)}


@router.get("/status")
def status_alias(request: Request):
    """Alias for /audiobooks/library/status."""
    return library_status(request)


@router.post("/configure")
async def configure_alias(request: Request):
    """Alias for /audiobooks/library/configure."""
    return await library_configure(request)


@router.post("/scan")
async def scan_alias(request: Request):
    """Alias for /audiobooks/library/scan."""
    return await library_scan(request)


@router.get("/stats")
def audiobooks_stats(db: Session = Depends(_get_db)):
    """Aggregated listening statistics."""
    from sqlalchemy import func
    from collections import Counter

    total = db.query(func.count(Audiobook.id)).scalar() or 0
    audiobooks = db.query(Audiobook).all()

    completed = 0
    total_listen_time_ms = 0
    total_duration_ms = 0
    author_counts = Counter()
    narrator_counts = Counter()
    year_counts = Counter()

    for ab in audiobooks:
        dur = ab.duration_ms or 0
        total_duration_ms += dur
        if ab.author:
            author_counts[ab.author] += 1
        if ab.narrator:
            narrator_counts[ab.narrator] += 1
        if ab.year:
            year_counts[ab.year] += 1

        p = ab.progress
        if p:
            total_listen_time_ms += p.position_ms or 0
            if dur > 0 and (p.position_ms or 0) >= dur * 0.95:
                completed += 1

    avg_duration_ms = round(total_duration_ms / total) if total > 0 else 0

    authors = sorted(
        [{"name": a, "count": c} for a, c in author_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )
    narrators = sorted(
        [{"name": n, "count": c} for n, c in narrator_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )
    years = sorted(
        [{"year": y, "count": c} for y, c in year_counts.items()],
        key=lambda x: x["year"],
        reverse=True,
    )

    return {
        "summary": {
            "total_audiobooks": total,
            "completed": completed,
            "total_listen_time_ms": total_listen_time_ms,
            "avg_duration_ms": avg_duration_ms,
        },
        "authors": authors,
        "narrators": narrators,
        "years": years,
    }


# ── Audiobook CRUD ─────────────────────────────────────────────────

@router.get("/{audiobook_id}")
def get_audiobook(audiobook_id: int, db: Session = Depends(_get_db)):
    """Get audiobook detail with chapters."""
    book = db.query(Audiobook).filter_by(id=audiobook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Audiobook not found")

    data = book.to_json()
    data["chapters"] = [
        ch.to_json() for ch in
        sorted(book.chapters, key=lambda c: c.chapter_number)
    ]
    if book.progress:
        data["progress"] = book.progress.to_json()
    else:
        data["progress"] = None
    return data


@router.get("/{audiobook_id}/player")
def audiobook_player(audiobook_id: int, request: Request, db: Session = Depends(_get_db)):
    """Full player state for an audiobook."""
    from .library_models import AudiobookFile

    book = db.query(Audiobook).filter_by(id=audiobook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Audiobook not found")

    chapters = [
        ch.to_json()
        for ch in sorted(book.chapters, key=lambda c: c.chapter_number)
    ]
    progress = (
        book.progress.to_json()
        if book.progress
        else {"position_ms": 0, "chapter_number": None}
    )

    Session_ = sessionmaker(bind=request.app.state.private_engine)
    pdb = Session_()
    try:
        af = pdb.query(AudiobookFile).filter_by(audiobook_id=audiobook_id).first()
        file_id = af.id if af else None
    finally:
        pdb.close()

    return {
        "audiobook": book.to_json(),
        "chapters": chapters,
        "progress": progress,
        "file_id": file_id,
        "stream_url": f"/audiobooks/stream/{file_id}" if file_id else None,
    }


# ── Streaming ──────────────────────────────────────────────────────

@router.get("/stream/{file_id}")
async def stream_audiobook(request: Request, file_id: int):
    """Stream an audiobook file."""
    from .library_models import AudiobookFile
    from .streamer import get_streamer

    Session_ = sessionmaker(bind=request.app.state.private_engine)
    db = Session_()
    try:
        af = db.query(AudiobookFile).filter_by(id=file_id).first()
        if not af:
            raise HTTPException(status_code=404, detail="File not found")
        file_path = af.file_path
    finally:
        db.close()

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    range_header = request.headers.get("range")
    streamer = get_streamer(file_path)
    return streamer.stream(file_path, range_header)


# ── Progress tracking ──────────────────────────────────────────────

@router.post("/{audiobook_id}/progress")
async def save_progress(audiobook_id: int, request: Request, db: Session = Depends(_get_db)):
    """Save listening position."""
    book = db.query(Audiobook).filter_by(id=audiobook_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Audiobook not found")

    data = await request.json()
    position_ms = data.get("position_ms", 0)
    chapter_number = data.get("chapter_number")

    progress = db.query(ListeningProgress).filter_by(audiobook_id=audiobook_id).first()
    if progress:
        progress.position_ms = position_ms
        progress.chapter_number = chapter_number
        progress.last_listened_at = datetime.now(timezone.utc)
    else:
        progress = ListeningProgress(
            audiobook_id=audiobook_id,
            position_ms=position_ms,
            chapter_number=chapter_number,
            last_listened_at=datetime.now(timezone.utc),
        )
        db.add(progress)

    db.commit()
    return progress.to_json()


@router.get("/{audiobook_id}/progress")
def get_progress(audiobook_id: int, db: Session = Depends(_get_db)):
    """Get current listening position."""
    progress = db.query(ListeningProgress).filter_by(audiobook_id=audiobook_id).first()
    if not progress:
        return {"audiobook_id": audiobook_id, "position_ms": 0, "chapter_number": None, "last_listened_at": None}
    return progress.to_json()
