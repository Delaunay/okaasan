"""API routes for the Books section."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .models import Book, ReadingProgress
from .metadata import OpenLibraryClient

log = logging.getLogger("okaasan.books")

router = APIRouter(prefix="/books", tags=["books"])

_ol_client: OpenLibraryClient | None = None
_library_scanner = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


def _get_private_db(request: Request):
    from sqlalchemy.orm import sessionmaker
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        yield db
    finally:
        db.close()


def _get_ol(request: Request) -> OpenLibraryClient:
    global _ol_client
    if _ol_client is None:
        base = Path(request.app.state.static_folder)
        data_dir = base / "uploads" / "data" / "books"
        _ol_client = OpenLibraryClient(data_dir)
    return _ol_client


# ── Library Management ─────────────────────────────────────────────

@router.get("/library/status")
def library_status(request: Request):
    """Get book library scan status and configuration."""
    from .library import load_config
    from .library_models import BookFile
    from sqlalchemy.orm import sessionmaker

    config = load_config(request.app.state.static_folder)
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        total = db.query(BookFile).count()
        matched = db.query(BookFile).filter_by(matched=True).count()
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
        "extensions": config.get("extensions", []),
    }


@router.post("/library/configure")
async def library_configure(request: Request):
    """Save book library folder configuration."""
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
    """Trigger a manual book library scan."""
    from .library import scan_folders
    from sqlalchemy import create_engine

    static_folder = request.app.state.static_folder
    private_engine = request.app.state.private_engine

    db_path = os.path.join(static_folder, "database.db")
    main_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    result = scan_folders(static_folder, private_engine, main_engine)

    global _library_scanner
    if _library_scanner:
        from datetime import datetime, timezone
        _library_scanner.last_scan = datetime.now(timezone.utc)
        _library_scanner.last_result = result

    return {"message": "Scan complete", **result}


@router.get("/library/all-files")
def library_all_files(request: Request):
    """Get all book library files."""
    from .library_models import BookFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        files = pdb.query(BookFile).order_by(BookFile.title, BookFile.author).all()
        return {"files": [f.to_json() for f in files]}
    finally:
        pdb.close()


# ── Books CRUD ─────────────────────────────────────────────────────

@router.get("/list")
def list_books(request: Request, db: Session = Depends(_get_db)):
    """List all books with their latest reading progress."""
    books = db.query(Book).order_by(Book.title).all()
    result = []
    for book in books:
        data = book.to_json()
        latest_progress = (
            db.query(ReadingProgress)
            .filter_by(book_id=book.id)
            .order_by(ReadingProgress.last_read_at.desc())
            .first()
        )
        data["progress"] = latest_progress.to_json() if latest_progress else None
        result.append(data)
    return result


@router.get("/search")
def search_books(request: Request, q: str = Query(..., min_length=1)):
    """Search Open Library for books."""
    ol = _get_ol(request)
    results = ol.search(q)
    return {"results": results}


@router.get("/{book_id:int}")
def get_book(request: Request, book_id: int, db: Session = Depends(_get_db)):
    """Get a single book with full details and progress history."""
    book = db.query(Book).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    data = book.to_json()
    progress_history = (
        db.query(ReadingProgress)
        .filter_by(book_id=book.id)
        .order_by(ReadingProgress.last_read_at.desc())
        .all()
    )
    data["progress_history"] = [p.to_json() for p in progress_history]
    return data


@router.get("/serve/{file_id:int}")
def serve_book_file(request: Request, file_id: int):
    """Serve a book file for reading."""
    from .library_models import BookFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        bf = pdb.query(BookFile).filter_by(id=file_id).first()
        if not bf:
            raise HTTPException(status_code=404, detail="File not found")
        file_path = bf.file_path
        file_format = bf.format
    finally:
        pdb.close()

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    content_types = {
        "epub": "application/epub+zip",
        "pdf": "application/pdf",
        "mobi": "application/x-mobipocket-ebook",
        "azw3": "application/vnd.amazon.ebook",
        "fb2": "application/x-fictionbook+xml",
    }
    media_type = content_types.get(file_format, "application/octet-stream")

    return FileResponse(
        file_path,
        media_type=media_type,
        filename=os.path.basename(file_path),
    )


# ── Reading Progress ───────────────────────────────────────────────

@router.get("/{book_id:int}/progress")
def get_progress(request: Request, book_id: int, db: Session = Depends(_get_db)):
    """Get reading progress for a book."""
    book = db.query(Book).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    progress = (
        db.query(ReadingProgress)
        .filter_by(book_id=book_id)
        .order_by(ReadingProgress.last_read_at.desc())
        .first()
    )
    if not progress:
        return {"book_id": book_id, "progress": None}
    return {"book_id": book_id, "progress": progress.to_json()}


@router.post("/{book_id:int}/progress")
async def save_progress(request: Request, book_id: int, db: Session = Depends(_get_db)):
    """Save reading position for a book."""
    from datetime import datetime, timezone

    book = db.query(Book).filter_by(id=book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    data = await request.json()

    current_page = data.get("current_page")
    current_cfi = data.get("current_cfi")
    total_pages = data.get("total_pages")
    percent = data.get("percent")

    if percent is None and current_page and total_pages and total_pages > 0:
        percent = round((current_page / total_pages) * 100, 2)

    progress = ReadingProgress(
        book_id=book_id,
        current_page=current_page,
        current_cfi=current_cfi,
        total_pages=total_pages,
        percent=percent,
        last_read_at=datetime.now(timezone.utc),
    )
    db.add(progress)
    db.commit()
    db.refresh(progress)

    return {"message": "Progress saved", "progress": progress.to_json()}
