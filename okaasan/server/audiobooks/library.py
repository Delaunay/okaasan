"""Audiobook library: crawl local folders, match files to DB entries, manage config."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from .library_models import AudiobookFile
from .models import Audiobook
from ..paths import private_folder
from ..scanner import BaseLibraryScanner

log = logging.getLogger("okaasan.audiobooks.library")

DEFAULT_EXTENSIONS = {"m4b", "mp3", "m4a", "ogg", "flac"}


def _config_path(static_folder: str) -> Path:
    return private_folder() / "_audiobooks.json"


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


def _parse_folder_structure(file_path: str) -> dict[str, str | None]:
    """Parse Author/Title folder structure and fall back to filename."""
    p = Path(file_path)
    parent = p.parent.name
    grandparent = p.parent.parent.name if p.parent.parent != p.parent else None

    title = None
    author = None

    if grandparent and grandparent not in (".", "/", ""):
        author = grandparent
        title = parent
    elif parent and parent not in (".", "/", ""):
        title = parent

    return {"title": title, "author": author}


def _read_tags(file_path: str) -> dict[str, str | None]:
    """Read embedded tags using mutagen."""
    try:
        import mutagen
        audio = mutagen.File(file_path, easy=True)
        if audio is None:
            return {}
        title = None
        author = None
        if "title" in audio:
            title = audio["title"][0] if isinstance(audio["title"], list) else audio["title"]
        if "album" in audio:
            title = audio["album"][0] if isinstance(audio["album"], list) else audio["album"]
        if "artist" in audio:
            author = audio["artist"][0] if isinstance(audio["artist"], list) else audio["artist"]
        if "albumartist" in audio:
            author = audio["albumartist"][0] if isinstance(audio["albumartist"], list) else audio["albumartist"]
        return {"title": title, "author": author}
    except Exception:
        return {}


def _match_to_db(db: Session, title: str | None, author: str | None) -> tuple[int | None, bool]:
    """Try to match parsed info to an audiobooks_media record. Returns (audiobook_id, matched)."""
    if not title:
        return None, False

    title_lower = title.lower().strip()

    candidates = db.query(Audiobook).all()
    for book in candidates:
        db_title = (book.title or "").lower().strip()
        db_author = (book.author or "").lower().strip()
        if db_title == title_lower:
            if not author or not db_author or db_author in author.lower() or author.lower() in db_author:
                return book.id, True

    # Partial match
    for book in candidates:
        db_title = (book.title or "").lower().strip()
        if title_lower in db_title or db_title in title_lower:
            return book.id, True

    return None, False


def scan_folders(static_folder: str, private_engine, main_engine) -> dict:
    """Scan configured folders and upsert audiobook files into private DB."""
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
                log.warning("Audiobook folder not found: %s", folder_path)
                continue

            for root, _dirs, files in os.walk(folder_path):
                for fname in files:
                    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                    if ext not in extensions:
                        continue

                    full_path = os.path.join(root, fname)
                    total_found += 1

                    existing = private_db.query(AudiobookFile).filter_by(file_path=full_path).first()
                    if existing:
                        existing.last_scanned = datetime.now(timezone.utc)
                        continue

                    folder_info = _parse_folder_structure(full_path)
                    tag_info = _read_tags(full_path)

                    title = tag_info.get("title") or folder_info.get("title")
                    author = tag_info.get("author") or folder_info.get("author")

                    audiobook_id, matched = _match_to_db(main_db, title, author)
                    if matched:
                        total_matched += 1

                    af = AudiobookFile(
                        audiobook_id=audiobook_id,
                        file_path=full_path,
                        file_size=os.path.getsize(full_path),
                        container=ext,
                        chapter_number=None,
                        title=title,
                        author=author,
                        last_scanned=datetime.now(timezone.utc),
                        matched=matched,
                    )
                    private_db.add(af)

        private_db.commit()
        log.info("Audiobook scan complete: %d files found, %d newly matched", total_found, total_matched)
        return {"files_found": total_found, "newly_matched": total_matched}

    except Exception as e:
        private_db.rollback()
        log.error("Audiobook library scan failed: %s", e)
        raise
    finally:
        private_db.close()
        main_db.close()


class AudiobookLibraryScanner(BaseLibraryScanner):
    """Background scanner that periodically crawls audiobook folders."""

    _log_name = "audiobooks"

    def _load_config(self) -> dict[str, Any]:
        return load_config(self.static_folder)

    def _get_folders(self, config: dict) -> list[str]:
        return config.get("folders", [])

    def _get_extensions(self, config: dict) -> set[str] | None:
        return set(config.get("extensions", DEFAULT_EXTENSIONS))

    def _do_scan(self) -> dict:
        return scan_folders(self.static_folder, self.private_engine, self.main_engine)
