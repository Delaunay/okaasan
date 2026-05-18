"""Media library: crawl local folders, match files to DB entries, manage config."""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from .library_models import MediaFile
from .models import Media
from ..paths import private_folder
from ..scanner import BaseLibraryScanner

log = logging.getLogger("okaasan.shows.library")

DEFAULT_EXTENSIONS = {"mkv", "mp4", "avi", "m4v", "ts", "webm", "mov"}

# Filename parsing patterns (priority order)
_PATTERNS = [
    # S01E03 style
    re.compile(
        r"(?P<title>.+?)[.\s_-]+[Ss](?P<season>\d{1,2})[Ee](?P<episode>\d{1,3})",
        re.IGNORECASE,
    ),
    # 1x03 style
    re.compile(
        r"(?P<title>.+?)[.\s_-]+(?P<season>\d{1,2})x(?P<episode>\d{2,3})",
        re.IGNORECASE,
    ),
    # Season N folder + Episode N file
    re.compile(
        r"[Ss]eason[.\s_-]*(?P<season>\d{1,2})",
        re.IGNORECASE,
    ),
]

_EP_IN_FILENAME = re.compile(r"[Ee](?:pisode)?[.\s_-]*(?P<episode>\d{1,3})")


def _config_path(static_folder: str) -> Path:
    return private_folder() / "_library.json"


def load_config(static_folder: str) -> dict[str, Any]:
    path = _config_path(static_folder)
    if path.is_file():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {"folders": {"shows": [], "movies": [], "anime": []}, "scan_interval_minutes": 60, "video_extensions": list(DEFAULT_EXTENSIONS)}


def save_config(static_folder: str, config: dict[str, Any]):
    path = _config_path(static_folder)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))


_JUNK_TAGS = re.compile(
    r"\b(720p|1080p|2160p|4k|bluray|bdrip|brrip|dvdrip|webrip|web-dl|hdtv|"
    r"x264|x265|h264|h265|hevc|aac|ac3|dts|remux|proper|repack|extended|"
    r"unrated|directors.cut|10bit)\b",
    re.IGNORECASE,
)


def _normalize_title(name: str) -> str:
    """Normalize a parsed title for comparison."""
    name = re.sub(r"[._]", " ", name)
    # Strip everything after a year (e.g., "Inception 2010 1080p BluRay")
    m = re.match(r"(.+?)\s*[\(\[]?\d{4}[\)\]]?", name)
    if m:
        name = m.group(1)
    # Remove known quality/codec tags
    name = _JUNK_TAGS.sub("", name)
    name = re.sub(r"\s+", " ", name).strip().lower()
    return name


def _parse_filename(file_path: str) -> dict | None:
    """Extract title, season, episode from a file path."""
    fname = Path(file_path).stem
    parent = Path(file_path).parent.name

    for pattern in _PATTERNS[:2]:
        m = pattern.match(fname)
        if m:
            return {
                "title": _normalize_title(m.group("title")),
                "season": int(m.group("season")),
                "episode": int(m.group("episode")),
            }

    # Try folder-based: "Season X" in parent, episode in filename
    season_match = _PATTERNS[2].search(parent)
    if season_match:
        ep_match = _EP_IN_FILENAME.search(fname)
        if ep_match:
            # Derive title from grandparent folder
            grandparent = Path(file_path).parent.parent.name
            return {
                "title": _normalize_title(grandparent),
                "season": int(season_match.group("season")),
                "episode": int(ep_match.group("episode")),
            }

    # Movie (no episode info)
    return {"title": _normalize_title(fname), "season": None, "episode": None}


def _match_to_db(db: Session, parsed: dict, media_type: str) -> tuple[int | None, int | None, bool]:
    """Try to match parsed file info to a shows_media record. Returns (media_id, tmdb_id, matched)."""
    title = parsed["title"]
    if not title:
        return None, None, False

    # Exact title match (case-insensitive)
    candidates = db.query(Media).filter(
        Media.media_type == ("show" if media_type in ("shows", "anime") else "movie"),
    ).all()

    best_match = None
    best_score = 0
    for media in candidates:
        db_title = (media.title or "").lower()
        if db_title == title:
            return media.id, media.tmdb_id, True
        # Partial match
        if title in db_title or db_title in title:
            score = len(title) / max(len(db_title), 1)
            if score > best_score and score > 0.6:
                best_score = score
                best_match = media

    if best_match:
        return best_match.id, best_match.tmdb_id, True

    return None, None, False


def scan_folders(static_folder: str, private_engine, main_engine):
    """Scan configured folders and upsert media files into private DB."""
    config = load_config(static_folder)
    extensions = set(config.get("video_extensions", DEFAULT_EXTENSIONS))
    folders = config.get("folders", {})

    PrivateSession = sessionmaker(bind=private_engine)
    MainSession = sessionmaker(bind=main_engine)

    private_db = PrivateSession()
    main_db = MainSession()

    try:
        total_found = 0
        total_matched = 0

        for media_type, paths in folders.items():
            for folder_path in paths:
                if not os.path.isdir(folder_path):
                    log.warning("Library folder not found: %s", folder_path)
                    continue

                for root, _dirs, files in os.walk(folder_path):
                    for fname in files:
                        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                        if ext not in extensions:
                            continue

                        full_path = os.path.join(root, fname)
                        total_found += 1

                        # Check if already in DB
                        existing = private_db.query(MediaFile).filter_by(file_path=full_path).first()
                        if existing:
                            existing.last_scanned = datetime.now(timezone.utc)
                            continue

                        parsed = _parse_filename(full_path)
                        if not parsed:
                            continue

                        media_id, tmdb_id, matched = _match_to_db(main_db, parsed, media_type)
                        if matched:
                            total_matched += 1

                        mf = MediaFile(
                            media_id=media_id,
                            media_type=media_type.rstrip("s") if media_type.endswith("s") else media_type,
                            tmdb_id=tmdb_id,
                            title=parsed["title"],
                            season=parsed.get("season"),
                            episode=parsed.get("episode"),
                            file_path=full_path,
                            file_size=os.path.getsize(full_path),
                            container=ext,
                            last_scanned=datetime.now(timezone.utc),
                            matched=matched,
                        )
                        private_db.add(mf)

        private_db.commit()
        log.info("Library scan complete: %d files found, %d newly matched", total_found, total_matched)
        return {"files_found": total_found, "newly_matched": total_matched}

    except Exception as e:
        private_db.rollback()
        log.error("Library scan failed: %s", e)
        raise
    finally:
        private_db.close()
        main_db.close()


class LibraryScanner(BaseLibraryScanner):
    """Background scanner that periodically crawls media folders."""

    _log_name = "shows"

    def _load_config(self) -> dict[str, Any]:
        return load_config(self.static_folder)

    def _get_folders(self, config: dict) -> list[str]:
        folders_dict = config.get("folders", {})
        result: list[str] = []
        for paths in folders_dict.values():
            if isinstance(paths, list):
                result.extend(paths)
        return result

    def _get_extensions(self, config: dict) -> set[str] | None:
        return set(config.get("extensions", DEFAULT_EXTENSIONS))

    def _do_scan(self) -> dict:
        return scan_folders(self.static_folder, self.private_engine, self.main_engine)
