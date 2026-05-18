"""Book library: scan local folders, parse metadata, match files to DB entries."""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from sqlalchemy.orm import Session, sessionmaker

from .library_models import BookFile
from .models import Book

log = logging.getLogger("okaasan.books.library")

DEFAULT_EXTENSIONS = {"epub", "pdf", "mobi", "azw3", "fb2"}


def _config_path(static_folder: str) -> Path:
    return Path(static_folder) / "private" / "_books.json"


def load_config(static_folder: str) -> dict[str, Any]:
    path = _config_path(static_folder)
    if path.is_file():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "folders": [],
        "scan_interval_minutes": 60,
        "extensions": list(DEFAULT_EXTENSIONS),
    }


def save_config(static_folder: str, config: dict[str, Any]):
    path = _config_path(static_folder)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))


def _parse_epub_metadata(file_path: str) -> dict[str, str | None]:
    """Extract title and author from an ePub file's OPF manifest."""
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            # Find the OPF file via container.xml
            container = zf.read("META-INF/container.xml")
            tree = ET.fromstring(container)
            ns = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
            rootfile = tree.find(".//c:rootfile", ns)
            if rootfile is None:
                return {"title": None, "author": None}

            opf_path = rootfile.get("full-path", "")
            opf_data = zf.read(opf_path)
            opf_tree = ET.fromstring(opf_data)

            dc_ns = "http://purl.org/dc/elements/1.1/"
            title_el = opf_tree.find(f".//{{{dc_ns}}}title")
            creator_el = opf_tree.find(f".//{{{dc_ns}}}creator")

            return {
                "title": title_el.text.strip() if title_el is not None and title_el.text else None,
                "author": creator_el.text.strip() if creator_el is not None and creator_el.text else None,
            }
    except (zipfile.BadZipFile, KeyError, ET.ParseError, OSError):
        return {"title": None, "author": None}


_JUNK_TAGS = re.compile(
    r"\b(retail|calibre|converted|scan|ocr|ebook|epub|pdf)\b",
    re.IGNORECASE,
)


def _normalize_title(name: str) -> str:
    """Normalize a filename-derived title for matching."""
    name = re.sub(r"[._\-]", " ", name)
    name = _JUNK_TAGS.sub("", name)
    name = re.sub(r"\s+", " ", name).strip().lower()
    return name


def _parse_filename(file_path: str) -> dict[str, str | None]:
    """Extract title and author from a filename pattern like 'Author - Title.ext'."""
    stem = Path(file_path).stem
    # Common pattern: "Author - Title" or "Title - Author"
    if " - " in stem:
        parts = stem.split(" - ", 1)
        return {
            "title": _normalize_title(parts[1]),
            "author": _normalize_title(parts[0]),
        }
    return {"title": _normalize_title(stem), "author": None}


def _parse_book_file(file_path: str, fmt: str) -> dict[str, str | None]:
    """Parse metadata from a book file using format-specific methods."""
    if fmt == "epub":
        meta = _parse_epub_metadata(file_path)
        if meta.get("title"):
            return meta

    return _parse_filename(file_path)


def _match_to_db(db: Session, parsed: dict[str, str | None]) -> tuple[int | None, bool]:
    """Try to match parsed file info to a books_media record. Returns (book_id, matched)."""
    title = parsed.get("title")
    if not title:
        return None, False

    author = parsed.get("author")

    candidates = db.query(Book).all()
    for book in candidates:
        db_title = (book.title or "").lower()
        db_author = (book.author or "").lower()
        if db_title == title:
            if not author or not db_author or author in db_author or db_author in author:
                return book.id, True
        if title in db_title or db_title in title:
            if author and db_author and (author in db_author or db_author in author):
                return book.id, True

    return None, False


def scan_folders(static_folder: str, private_engine, main_engine) -> dict:
    """Scan configured folders and upsert book files into private DB."""
    config = load_config(static_folder)
    extensions = set(config.get("extensions", DEFAULT_EXTENSIONS))
    folders = config.get("folders", [])

    PrivateSession = sessionmaker(bind=private_engine)
    MainSession = sessionmaker(bind=main_engine)

    private_db = PrivateSession()
    main_db = MainSession()

    try:
        total_found = 0
        total_matched = 0

        for folder_path in folders:
            if not os.path.isdir(folder_path):
                log.warning("Book library folder not found: %s", folder_path)
                continue

            for root, _dirs, files in os.walk(folder_path):
                for fname in files:
                    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                    if ext not in extensions:
                        continue

                    full_path = os.path.join(root, fname)
                    total_found += 1

                    existing = private_db.query(BookFile).filter_by(file_path=full_path).first()
                    if existing:
                        existing.last_scanned = datetime.now(timezone.utc)
                        continue

                    parsed = _parse_book_file(full_path, ext)
                    book_id, matched = _match_to_db(main_db, parsed)
                    if matched:
                        total_matched += 1

                    bf = BookFile(
                        book_id=book_id,
                        file_path=full_path,
                        file_size=os.path.getsize(full_path),
                        format=ext,
                        title=parsed.get("title"),
                        author=parsed.get("author"),
                        last_scanned=datetime.now(timezone.utc),
                        matched=matched,
                    )
                    private_db.add(bf)

        private_db.commit()
        log.info("Book library scan complete: %d files found, %d newly matched", total_found, total_matched)
        return {"files_found": total_found, "newly_matched": total_matched}

    except Exception as e:
        private_db.rollback()
        log.error("Book library scan failed: %s", e)
        raise
    finally:
        private_db.close()
        main_db.close()


class BookLibraryScanner:
    """Background scanner that periodically crawls book folders."""

    def __init__(self, static_folder: str, private_engine, main_engine):
        self.static_folder = static_folder
        self.private_engine = private_engine
        self.main_engine = main_engine
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self.last_scan: datetime | None = None
        self.last_result: dict | None = None

    def start(self):
        config = load_config(self.static_folder)
        if not config.get("folders"):
            log.info("No book library folders configured, skipping background scan")
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def scan_now(self) -> dict:
        """Trigger an immediate scan (synchronous)."""
        result = scan_folders(self.static_folder, self.private_engine, self.main_engine)
        self.last_scan = datetime.now(timezone.utc)
        self.last_result = result
        return result

    def _run(self):
        try:
            self.scan_now()
        except Exception as e:
            log.warning("Initial book library scan failed: %s", e)

        while not self._stop_event.is_set():
            config = load_config(self.static_folder)
            interval = config.get("scan_interval_minutes", 60) * 60
            self._stop_event.wait(timeout=interval)
            if self._stop_event.is_set():
                break
            try:
                self.scan_now()
            except Exception as e:
                log.warning("Periodic book library scan failed: %s", e)
