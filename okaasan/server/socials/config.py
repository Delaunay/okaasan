"""Configuration for social media data dump paths."""
from __future__ import annotations

import json
from pathlib import Path

from ..paths import STATIC_FOLDER, private_folder

PLATFORMS = ("instagram", "facebook", "linkedin")
CONFIG_FILE = "_socials.json"


def config_path() -> Path:
    return private_folder() / CONFIG_FILE


def load_config() -> dict:
    p = config_path()
    if p.is_file():
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return {"dumps": {}}


def save_config(cfg: dict) -> None:
    p = config_path()
    with open(p, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def _candidate_paths(platform: str) -> list[Path]:
    cfg = load_config()
    custom = cfg.get("dumps", {}).get(platform)
    return [
        Path(custom) if custom else None,
        Path(STATIC_FOLDER) / "dumps" / platform,
        private_folder() / "dumps" / "socials" / platform,
    ]


def get_dump_dir(platform: str) -> Path | None:
    if platform not in PLATFORMS:
        return None
    for candidate in _candidate_paths(platform):
        if candidate and candidate.is_dir():
            return candidate
    return None


def default_dump_dir(platform: str) -> Path:
    return Path(STATIC_FOLDER) / "dumps" / platform
