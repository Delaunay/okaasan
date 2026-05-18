"""Comic library: scan local folders, match files to DB entries, manage config."""
from __future__ import annotations

import json
import logging
import os
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from .library_models import ComicFile
from .models import Comic
from ..paths import private_folder
from ..scanner import BaseLibraryScanner

log = logging.getLogger("okaasan.comics.library")

DEFAULT_EXTENSIONS = {"cbz", "cbr", "pdf", "epub"}


def _config_path(static_folder: str) -> Path:
    return private_folder() / "_comics.json"


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


# Filename patterns: "Series Name 005 (2020).cbz", "Series Name #12.cbz"
_ISSUE_PATTERN = re.compile(
    r"(?P<series>.+?)\s*(?:#|v|vol\.?\s*|issue\s*)?(?P<issue>\d+)",
    re.IGNORECASE,
)

_JUNK_TAGS = re.compile(
    r"\b(digital|c2c|minutemen|empire|dcp|noads|4k|hd)\b",
    re.IGNORECASE,
)


def _normalize_title(name: str) -> str:
    name = re.sub(r"[._]", " ", name)
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r"\[.*?\]", "", name)
    name = _JUNK_TAGS.sub("", name)
    name = re.sub(r"\s+", " ", name).strip().lower()
    return name


def _parse_comic_filename(file_path: str) -> dict:
    """Extract series and issue number from a comic filename."""
    fname = Path(file_path).stem

    m = _ISSUE_PATTERN.match(fname)
    if m:
        return {
            "series": _normalize_title(m.group("series")),
            "title": _normalize_title(fname),
            "issue_number": int(m.group("issue")),
        }

    return {
        "series": None,
        "title": _normalize_title(fname),
        "issue_number": None,
    }


def _parse_comicinfo_xml(file_path: str) -> dict | None:
    """Try to read ComicInfo.xml from a CBZ archive."""
    if not file_path.lower().endswith(".cbz"):
        return None
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            names = zf.namelist()
            ci_name = next((n for n in names if n.lower() == "comicinfo.xml"), None)
            if not ci_name:
                return None
            import xml.etree.ElementTree as ET
            xml_data = zf.read(ci_name)
            root = ET.fromstring(xml_data)
            info: dict[str, Any] = {}
            for tag in ("Title", "Series", "Number", "Volume", "Writer", "Penciller",
                        "Publisher", "Year", "PageCount", "Summary"):
                el = root.find(tag)
                if el is not None and el.text:
                    info[tag] = el.text.strip()
            return info
    except (zipfile.BadZipFile, OSError, Exception):
        return None


def _match_to_db(main_db: Session, parsed: dict) -> tuple[int | None, bool]:
    """Try to match parsed comic info to a comics_media record. Returns (comic_id, matched)."""
    title = parsed.get("title", "")
    series = parsed.get("series")
    issue = parsed.get("issue_number")

    if series and issue is not None:
        candidate = main_db.query(Comic).filter(
            Comic.series.ilike(series),
            Comic.issue_number == issue,
        ).first()
        if candidate:
            return candidate.id, True

    if title:
        candidates = main_db.query(Comic).all()
        for c in candidates:
            db_title = (c.title or "").lower()
            if db_title == title:
                return c.id, True
            if title in db_title or db_title in title:
                score = len(title) / max(len(db_title), 1)
                if score > 0.6:
                    return c.id, True

    return None, False


def scan_folders(static_folder: str, private_engine, main_engine) -> dict:
    """Scan configured folders and upsert comic files into private DB."""
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
                log.warning("Comic library folder not found: %s", folder_path)
                continue

            for root, _dirs, files in os.walk(folder_path):
                for fname in files:
                    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                    if ext not in extensions:
                        continue

                    full_path = os.path.join(root, fname)
                    total_found += 1

                    existing = private_db.query(ComicFile).filter_by(file_path=full_path).first()
                    if existing:
                        existing.last_scanned = datetime.now(timezone.utc)
                        continue

                    parsed = _parse_comic_filename(full_path)

                    ci = _parse_comicinfo_xml(full_path)
                    if ci:
                        parsed["series"] = _normalize_title(ci.get("Series", "")) or parsed.get("series")
                        parsed["title"] = ci.get("Title", parsed["title"])
                        if ci.get("Number"):
                            try:
                                parsed["issue_number"] = int(ci["Number"])
                            except ValueError:
                                pass

                    comic_id, matched = _match_to_db(main_db, parsed)
                    if matched:
                        total_matched += 1

                    cf = ComicFile(
                        comic_id=comic_id,
                        file_path=full_path,
                        file_size=os.path.getsize(full_path),
                        format=ext,
                        title=parsed.get("title"),
                        series=parsed.get("series"),
                        issue_number=parsed.get("issue_number"),
                        last_scanned=datetime.now(timezone.utc),
                        matched=matched,
                    )
                    private_db.add(cf)

        private_db.commit()
        log.info("Comic library scan complete: %d files found, %d newly matched", total_found, total_matched)
        return {"files_found": total_found, "newly_matched": total_matched}

    except Exception as e:
        private_db.rollback()
        log.error("Comic library scan failed: %s", e)
        raise
    finally:
        private_db.close()
        main_db.close()


class ComicLibraryScanner(BaseLibraryScanner):
    """Background scanner that periodically crawls comic folders."""

    _log_name = "comics"

    def _load_config(self) -> dict[str, Any]:
        return load_config(self.static_folder)

    def _get_folders(self, config: dict) -> list[str]:
        return config.get("folders", [])

    def _get_extensions(self, config: dict) -> set[str] | None:
        return set(config.get("extensions", DEFAULT_EXTENSIONS))

    def _do_scan(self) -> dict:
        return scan_folders(self.static_folder, self.private_engine, self.main_engine)
