"""ROM library: scan local folders, match files to DB entries, manage config."""
from __future__ import annotations

import json
import logging
import os
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from .library_models import RomFile
from .models import Game

log = logging.getLogger("okaasan.games.library")

EXTENSION_TO_PLATFORM: dict[str, str] = {
    "nes": "nes",
    "sfc": "snes",
    "smc": "snes",
    "gb": "gb",
    "gbc": "gbc",
    "gba": "gba",
    "n64": "n64",
    "z64": "n64",
    "v64": "n64",
    "md": "genesis",
    "gen": "genesis",
    "smd": "genesis",
    "sms": "sms",
    "bin": "psx",
    "cue": "psx",
    "iso": "psx",
    "pbp": "psp",
    "cso": "psp",
    "nds": "nds",
    "a26": "atari2600",
    "a78": "atari7800",
    "zip": "arcade",
}

_REGION_TAGS = re.compile(
    r"\s*[\(\[](USA|Europe|Japan|World|En|Fr|De|Es|It|Ja|"
    r"U|E|J|UE|JU|Rev\s*[A-Z0-9]|V\d+\.\d+|"
    r"Proto|Beta|Sample|Demo|Unl|Hack|PD|Pirate|"
    r"[!\?]|b\d+|o\d+|t[\+\-]?\w*|f\d*|h\d*\w*|p\d*|a\d*|"
    r"\d{4})"
    r"[\)\]]",
    re.IGNORECASE,
)

_SCENE_TAGS = re.compile(
    r"\s*[\[\(].*?[\]\)]",
)


def _config_path(static_folder: str) -> Path:
    return Path(static_folder) / "private" / "_games.json"


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
        "platform_from_extension": EXTENSION_TO_PLATFORM,
    }


def save_config(static_folder: str, config: dict[str, Any]):
    path = _config_path(static_folder)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))


def _parse_title(filename: str) -> str:
    """Parse a clean title from a ROM filename."""
    name = Path(filename).stem
    name = _REGION_TAGS.sub("", name)
    name = _SCENE_TAGS.sub("", name)
    name = re.sub(r"[_\-]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _match_to_db(db: Session, title: str, platform: str | None) -> tuple[int | None, bool]:
    """Try to match a ROM to a games_media record. Returns (game_id, matched)."""
    if not title:
        return None, False

    q = db.query(Game)
    if platform:
        q = q.filter(Game.platform == platform)

    candidates = q.all()
    title_lower = title.lower()

    for game in candidates:
        db_title = (game.title or "").lower()
        if db_title == title_lower:
            return game.id, True

    for game in candidates:
        db_title = (game.title or "").lower()
        if title_lower in db_title or db_title in title_lower:
            return game.id, True

    return None, False


def scan_folders(static_folder: str, private_engine, main_engine) -> dict:
    """Scan configured folders and upsert ROM files into private DB."""
    config = load_config(static_folder)
    ext_map = config.get("platform_from_extension", EXTENSION_TO_PLATFORM)
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
                log.warning("ROM folder not found: %s", folder_path)
                continue

            for root, _dirs, files in os.walk(folder_path):
                for fname in files:
                    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                    if ext not in ext_map:
                        continue

                    full_path = os.path.join(root, fname)
                    total_found += 1

                    existing = private_db.query(RomFile).filter_by(file_path=full_path).first()
                    if existing:
                        existing.last_scanned = datetime.now(timezone.utc)
                        continue

                    platform = ext_map.get(ext)
                    title = _parse_title(fname)
                    game_id, matched = _match_to_db(main_db, title, platform)
                    if matched:
                        total_matched += 1

                    rf = RomFile(
                        game_id=game_id,
                        file_path=full_path,
                        file_size=os.path.getsize(full_path),
                        platform=platform,
                        container=ext,
                        title=title,
                        last_scanned=datetime.now(timezone.utc),
                        matched=matched,
                    )
                    private_db.add(rf)

        private_db.commit()
        log.info("ROM scan complete: %d files found, %d newly matched", total_found, total_matched)
        return {"files_found": total_found, "newly_matched": total_matched}

    except Exception as e:
        private_db.rollback()
        log.error("ROM scan failed: %s", e)
        raise
    finally:
        private_db.close()
        main_db.close()


class GameLibraryScanner:
    """Background scanner that periodically crawls ROM folders."""

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
            log.info("No ROM folders configured, skipping background scan")
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def scan_now(self) -> dict:
        result = scan_folders(self.static_folder, self.private_engine, self.main_engine)
        self.last_scan = datetime.now(timezone.utc)
        self.last_result = result
        return result

    def _run(self):
        try:
            self.scan_now()
        except Exception as e:
            log.warning("Initial ROM scan failed: %s", e)

        while not self._stop_event.is_set():
            config = load_config(self.static_folder)
            interval = config.get("scan_interval_minutes", 60) * 60
            self._stop_event.wait(timeout=interval)
            if self._stop_event.is_set():
                break
            try:
                self.scan_now()
            except Exception as e:
                log.warning("Periodic ROM scan failed: %s", e)
