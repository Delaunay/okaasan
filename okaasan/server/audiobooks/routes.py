"""API routes for Audiobooks section."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Depends
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
