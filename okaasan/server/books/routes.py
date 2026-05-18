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


# ── Overview, Library & Stats ──────────────────────────────────────

@router.get("/overview")
def books_overview(request: Request, db: Session = Depends(_get_db)):
    """Dashboard overview: stats, currently reading, recently added."""
    from datetime import datetime
    from .library_models import BookFile
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import func

    latest_sq = (
        db.query(
            ReadingProgress.book_id,
            func.max(ReadingProgress.id).label("max_id"),
        )
        .group_by(ReadingProgress.book_id)
        .subquery()
    )
    latest_rows = (
        db.query(ReadingProgress)
        .join(latest_sq, ReadingProgress.id == latest_sq.c.max_id)
        .all()
    )

    total_books = db.query(func.count(Book.id)).scalar() or 0

    reading = 0
    completed = 0
    total_pages_read = 0
    for p in latest_rows:
        pct = p.percent or 0
        if pct >= 95:
            completed += 1
        elif pct > 0:
            reading += 1
        total_pages_read += p.current_page or 0

    reading_progress = sorted(
        [p for p in latest_rows if p.percent and 0 < p.percent < 95],
        key=lambda p: p.last_read_at or datetime.min,
        reverse=True,
    )[:12]

    reading_book_ids = [p.book_id for p in reading_progress]
    reading_books = {
        b.id: b
        for b in db.query(Book).filter(Book.id.in_(reading_book_ids)).all()
    } if reading_book_ids else {}

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        files = (
            pdb.query(BookFile)
            .filter(BookFile.book_id.in_(reading_book_ids))
            .all()
        ) if reading_book_ids else []
        file_map = {}
        for f in files:
            if f.book_id not in file_map:
                file_map[f.book_id] = f
    finally:
        pdb.close()

    currently_reading = []
    for p in reading_progress:
        book = reading_books.get(p.book_id)
        if not book:
            continue
        data = book.to_json()
        data["progress"] = p.to_json()
        bf = file_map.get(book.id)
        data["file_id"] = bf.id if bf else None
        data["format"] = bf.format if bf else None
        currently_reading.append(data)

    recently_added = [
        b.to_json()
        for b in db.query(Book).order_by(Book.created_at.desc()).limit(12).all()
    ]

    # Format counts from private DB
    PrivateSession2 = sessionmaker(bind=request.app.state.private_engine)
    pdb2 = PrivateSession2()
    try:
        format_rows = pdb2.query(BookFile.format, func.count(BookFile.id)).group_by(BookFile.format).all()
        formats = {f: c for f, c in format_rows if f}
    finally:
        pdb2.close()

    return {
        "stats": {
            "total_books": total_books,
            "reading": reading,
            "completed": completed,
            "total_pages_read": total_pages_read,
            "formats": formats,
        },
        "currently_reading": currently_reading,
        "recently_added": recently_added,
        "reading_list": [],
    }


@router.get("/library")
def books_library(
    request: Request,
    q: str = Query(None),
    format: str = Query(None),
    status: str = Query(None),
    db: Session = Depends(_get_db),
):
    """Filterable book library with status and file info."""
    from .library_models import BookFile
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import func

    query = db.query(Book)
    if q:
        pattern = f"%{q}%"
        query = query.filter(Book.title.ilike(pattern) | Book.author.ilike(pattern))

    books = query.order_by(Book.title).all()
    book_ids = [b.id for b in books]

    progress_map = {}
    if book_ids:
        latest_sq = (
            db.query(
                ReadingProgress.book_id,
                func.max(ReadingProgress.id).label("max_id"),
            )
            .filter(ReadingProgress.book_id.in_(book_ids))
            .group_by(ReadingProgress.book_id)
            .subquery()
        )
        latest_rows = (
            db.query(ReadingProgress)
            .join(latest_sq, ReadingProgress.id == latest_sq.c.max_id)
            .all()
        )
        progress_map = {p.book_id: p for p in latest_rows}

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        if book_ids:
            file_query = pdb.query(BookFile).filter(BookFile.book_id.in_(book_ids))
            if format:
                file_query = file_query.filter(BookFile.format == format)
            files = file_query.all()
        else:
            files = []
        file_map = {}
        format_book_ids = set()
        for f in files:
            if f.book_id not in file_map:
                file_map[f.book_id] = f
            format_book_ids.add(f.book_id)
    finally:
        pdb.close()

    result = []
    for book in books:
        if format and book.id not in format_book_ids:
            continue

        p = progress_map.get(book.id)
        pct = p.percent if p else None

        if pct is not None and pct >= 95:
            book_status = "completed"
        elif pct is not None and pct > 0:
            book_status = "reading"
        else:
            book_status = "unread"

        if status and book_status != status:
            continue

        data = book.to_json()
        data["status"] = book_status
        data["progress_percent"] = pct
        data["progress"] = pct or 0
        data["current_page"] = p.current_page if p else 0
        data["added_at"] = book.created_at.isoformat() + "Z" if book.created_at else None
        bf = file_map.get(book.id)
        data["file_id"] = bf.id if bf else None
        data["format"] = bf.format if bf else None
        result.append(data)

    return {"books": result, "total": len(result)}


@router.get("/stats")
def books_stats(request: Request, db: Session = Depends(_get_db)):
    """Aggregated reading statistics."""
    from collections import Counter
    from sqlalchemy import func

    total_books = db.query(func.count(Book.id)).scalar() or 0

    latest_sq = (
        db.query(
            ReadingProgress.book_id,
            func.max(ReadingProgress.id).label("max_id"),
        )
        .group_by(ReadingProgress.book_id)
        .subquery()
    )
    latest_rows = (
        db.query(ReadingProgress)
        .join(latest_sq, ReadingProgress.id == latest_sq.c.max_id)
        .all()
    )

    completed = sum(1 for p in latest_rows if (p.percent or 0) >= 95)
    pages_read = sum(p.current_page or 0 for p in latest_rows)

    genre_counts = Counter()
    author_counts = Counter()
    for book in db.query(Book).all():
        if book.genre:
            genre_counts[book.genre] += 1
        if book.author:
            author_counts[book.author] += 1

    genres = sorted(
        [{"name": g, "count": c} for g, c in genre_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )
    authors = sorted(
        [{"name": a, "count": c} for a, c in author_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )

    month_counts = Counter()
    for p in latest_rows:
        if (p.percent or 0) >= 95 and p.last_read_at:
            month_counts[p.last_read_at.strftime("%Y-%m")] += 1

    reading_pace = sorted(
        [{"month": m, "books_completed": c} for m, c in month_counts.items()],
        key=lambda x: x["month"],
    )

    return {
        "summary": {
            "total_books": total_books,
            "completed": completed,
            "pages_read": pages_read,
        },
        "genres": genres,
        "authors": authors,
        "reading_pace": reading_pace,
    }


# ── Books CRUD ─────────────────────────────────────────────────────

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
