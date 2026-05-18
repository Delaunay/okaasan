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

# Anime-specific patterns (order matters: more specific first)
_ANIME_PATTERNS = [
    # [SubGroup] Title Season 2 - 01 or [SubGroup] Title S1 - 01
    re.compile(
        r"^\[.+?\]\s*(?P<title>.+?)\s+(?:[Ss]eason\s*|[Ss])(?P<season>\d{1,2})\s*-\s*(?P<episode>\d{1,4})\b",
        re.IGNORECASE,
    ),
    # [SubGroup] Title - S01E03 [1080p].mkv
    re.compile(
        r"^\[.+?\]\s*(?P<title>.+?)\s*-?\s*[Ss](?P<season>\d{1,2})[Ee](?P<episode>\d{1,3})",
    ),
    # [SubGroup] Title - 01 [1080p].mkv
    re.compile(
        r"^\[.+?\]\s*(?P<title>.+?)\s*-\s*(?P<episode>\d{1,4})\b",
    ),
    # [SubGroup] Title Episode 01 [1080p].mkv
    re.compile(
        r"^\[.+?\]\s*(?P<title>.+?)\s+(?:EP?|Episode)\s*(?P<episode>\d{1,4})\b",
        re.IGNORECASE,
    ),
    # Title Episode 01 (no sub group)
    re.compile(
        r"^(?P<title>.+?)\s+(?:Episode|EP)\s*(?P<episode>\d{1,4})\b",
        re.IGNORECASE,
    ),
    # Title - 01 [quality] (no sub group, common for batch releases)
    re.compile(
        r"^(?P<title>[^\[\]]+?)\s*-\s*(?P<episode>\d{1,4})\s*(?:\[|\(|$)",
    ),
]

_EP_IN_FILENAME = re.compile(r"[Ee](?:pisode)?[.\s_-]*(?P<episode>\d{1,3})")
# Bare episode number at end of filename (common in anime)
_BARE_EP = re.compile(r"[\s_-]+(?P<episode>\d{2,4})(?:\s*(?:v\d)?)?(?:\s*[\[\(]|$)")


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


def _parse_filename(file_path: str, media_type: str = "shows") -> dict | None:
    """Extract title, season, episode from a file path."""
    fname = Path(file_path).stem
    parent = Path(file_path).parent.name

    # For anime folders or files starting with [SubGroup], try anime patterns first
    is_anime_like = fname.startswith("[") or media_type == "anime"
    if is_anime_like:
        result = _parse_anime_filename(fname, parent, file_path)
        if result:
            return result

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
            grandparent = Path(file_path).parent.parent.name
            return {
                "title": _normalize_title(grandparent),
                "season": int(season_match.group("season")),
                "episode": int(ep_match.group("episode")),
            }

    # For anime without [SubGroup], still try a bare episode number
    if is_anime_like:
        ep_match = _BARE_EP.search(fname)
        if ep_match:
            title_part = fname[:ep_match.start()]
            title_part = re.sub(r"^\[.*?\]\s*", "", title_part)
            return {
                "title": _normalize_title(title_part) or _normalize_title(parent),
                "season": 1,
                "episode": int(ep_match.group("episode")),
            }

    # Movie (no episode info)
    return {"title": _normalize_title(fname), "season": None, "episode": None}


_EXTRAS_RE = re.compile(
    r"\b(NCED|NCOP|NC\s?ED|NC\s?OP|Creditless|Preview|PV|Menu|Trailer|"
    r"Opening|Ending|OP\d*|ED\d*|SP\d*|Special|OVA|OAD|Bonus)\b",
    re.IGNORECASE,
)


def _parse_anime_filename(fname: str, parent: str, file_path: str) -> dict | None:
    """Parse anime-style filenames like [SubGroup] Title - 01 [1080p]."""
    # Normalize underscores/dots to spaces for pattern matching
    norm = re.sub(r"[._]", " ", fname)

    # Skip extras (NCED, NCOP, OVA, etc.)
    content_part = re.sub(r"^\[.*?\]\s*", "", norm)
    # Bare extras filenames (e.g. "ED.mkv", "OP.mkv", "Sample (+Intro).mkv")
    if re.match(r"^(?:NCED|NCOP|OP|ED|PV|OVA|OAD|Bonus|Special|Trailer|Menu|Opening|Ending|Sample)\b", content_part, re.IGNORECASE):
        return {"title": "__extra__", "season": 0, "episode": 0}
    # After the last dash, if the remainder is just an extras keyword (optionally with a number), skip
    after_dash = content_part.rsplit("-", 1)[-1].strip() if "-" in content_part else ""
    if re.match(r"^(?:NCED|NCOP|NC\s?ED|NC\s?OP|OP|ED|SP|PV|OVA|OAD|Bonus|Special|Trailer|Menu|Opening|Ending)\s*\d*\s*[\[\(]?", after_dash, re.IGNORECASE):
        return {"title": "__extra__", "season": 0, "episode": 0}

    for pattern in _ANIME_PATTERNS:
        m = pattern.match(norm)
        if m:
            title = m.group("title").strip()
            title = _JUNK_TAGS.sub("", title)
            title = re.sub(r"\s*[\[\(].*$", "", title).strip()
            title = re.sub(r"\s*~\w+$", "", title).strip()
            title = _normalize_title(title)
            if not title:
                title = _normalize_title(parent)
            season = int(m.group("season")) if "season" in m.groupdict() else 1
            episode = int(m.group("episode"))
            return {"title": title, "season": season, "episode": episode}

    # Derive title from parent folder for anime (often folder = show name)
    # Skip if filename has a standard SxxExx pattern (handled by _PATTERNS later)
    if not norm.startswith("[") and not re.search(r"[Ss]\d{1,2}[Ee]\d{1,3}", norm):
        ep_match = _EP_IN_FILENAME.search(norm)
        if ep_match:
            return {
                "title": _normalize_title(parent),
                "season": 1,
                "episode": int(ep_match.group("episode")),
            }

    return None


def _match_to_db(db: Session, parsed: dict, media_type: str) -> tuple[int | None, int | None, bool]:
    """Try to match parsed file info to a shows_media record. Returns (media_id, tmdb_id, matched)."""
    title = parsed["title"]
    if not title:
        return None, None, False

    db_media_type = "show" if media_type in ("shows", "anime") else "movie"
    candidates = db.query(Media).filter(
        Media.media_type == db_media_type,
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
                            # Re-evaluate unmatched files with current patterns
                            if not existing.matched:
                                parsed = _parse_filename(full_path, media_type)
                                if parsed and parsed.get("title") != "__extra__":
                                    media_id, tmdb_id, matched = _match_to_db(main_db, parsed, media_type)
                                    if not matched and media_type == "anime":
                                        media_id, tmdb_id, matched = _match_anime_online(main_db, parsed)
                                    if matched:
                                        existing.media_id = media_id
                                        existing.tmdb_id = tmdb_id
                                        existing.title = parsed["title"]
                                        existing.season = parsed.get("season")
                                        existing.episode = parsed.get("episode")
                                        existing.matched = True
                                        total_matched += 1
                            continue

                        parsed = _parse_filename(full_path, media_type)
                        if not parsed or parsed.get("title") == "__extra__":
                            continue

                        media_id, tmdb_id, matched = _match_to_db(main_db, parsed, media_type)
                        if not matched and media_type == "anime":
                            media_id, tmdb_id, matched = _match_anime_online(main_db, parsed)
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


# ═══════════════════════════════════════════════════════════════════════════════
# Kitsu anime lookup (for unmatched anime files) — no auth required
# ═══════════════════════════════════════════════════════════════════════════════

_KITSU_API = "https://kitsu.io/api/edge/anime"

_kitsu_cache: dict[str, list[dict]] = {}
_kitsu_last_req: float = 0
_KITSU_MIN_INTERVAL = 1.0  # generous rate limit, 1s between requests is safe


def _search_kitsu_anime(title: str) -> list[dict]:
    """Search Kitsu for anime by title. No auth required. Returns list of results."""
    import time

    key = title.lower().strip()
    if key in _kitsu_cache:
        return _kitsu_cache[key]

    global _kitsu_last_req
    elapsed = time.time() - _kitsu_last_req
    if elapsed < _KITSU_MIN_INTERVAL:
        time.sleep(_KITSU_MIN_INTERVAL - elapsed)

    try:
        import httpx
        _kitsu_last_req = time.time()
        resp = httpx.get(
            _KITSU_API,
            params={"filter[text]": title, "page[limit]": "5"},
            headers={
                "Accept": "application/vnd.api+json",
                "User-Agent": "okaasan-media-server/1.0",
            },
            timeout=10,
        )
        if resp.status_code == 429:
            log.warning("Kitsu 429 rate limited, pausing 5s")
            time.sleep(5)
            _kitsu_last_req = time.time()
            resp = httpx.get(
                _KITSU_API,
                params={"filter[text]": title, "page[limit]": "5"},
                headers={
                    "Accept": "application/vnd.api+json",
                    "User-Agent": "okaasan-media-server/1.0",
                },
                timeout=10,
            )
            if resp.status_code == 429:
                _kitsu_cache[key] = []
                return []

        resp.raise_for_status()
        results = resp.json().get("data", [])
        _kitsu_cache[key] = results
        return results
    except Exception as e:
        log.debug("Kitsu anime search failed for %r: %s", title, e)
        _kitsu_cache[key] = []
        return []


def _match_anime_online(db: Session, parsed: dict) -> tuple[int | None, int | None, bool]:
    """Try to match an anime title via Kitsu, creating a Media entry if found."""
    title = parsed["title"]
    if not title or len(title) < 3:
        return None, None, False

    results = _search_kitsu_anime(title)
    if not results:
        return None, None, False

    # Pick the best result
    best = results[0]
    attrs = best.get("attributes", {})
    titles = attrs.get("titles", {})
    kitsu_titles = [
        (titles.get("en") or "").lower(),
        (titles.get("en_jp") or "").lower(),
        (titles.get("ja_jp") or "").lower(),
        (attrs.get("canonicalTitle") or "").lower(),
    ]

    # Verify the match is reasonable
    title_lower = title.lower()
    matched = any(
        t and (title_lower in t or t in title_lower)
        for t in kitsu_titles if t
    )
    if not matched and len(results) > 1:
        best = results[1]
        attrs = best.get("attributes", {})
        titles = attrs.get("titles", {})
        kitsu_titles = [
            (titles.get("en") or "").lower(),
            (titles.get("en_jp") or "").lower(),
            (titles.get("ja_jp") or "").lower(),
            (attrs.get("canonicalTitle") or "").lower(),
        ]
        matched = any(
            t and (title_lower in t or t in title_lower)
            for t in kitsu_titles if t
        )

    if not matched:
        return None, None, False

    display_title = titles.get("en") or attrs.get("canonicalTitle") or titles.get("en_jp") or title

    # Check if we already have this in our DB (by title)
    existing = db.query(Media).filter(
        Media.media_type == "show",
        Media.title.ilike(display_title),
    ).first()
    if existing:
        return existing.id, existing.tmdb_id, True

    # Create a new Media entry for this anime
    media = Media(
        media_type="show",
        title=display_title,
        year=None,
        tmdb_id=None,
    )
    db.add(media)
    db.flush()
    log.info("Created anime entry from Kitsu: %s (kitsu_id=%s)", display_title, best.get("id"))
    return media.id, None, True


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
