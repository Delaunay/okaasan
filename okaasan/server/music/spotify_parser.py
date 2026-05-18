"""Parse Spotify Extended Streaming History JSON files."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Iterator

log = logging.getLogger("okaasan.music.spotify_parser")


def iter_play_events(dump_dir: str | Path) -> Iterator[dict]:
    """Yield every play event from Streaming_History_Audio_*.json files.

    Each yielded dict has an extra ``_kind`` key: ``"music"`` or ``"podcast"``.
    Records where both track and episode URIs are null are skipped.
    """
    dump_path = Path(dump_dir)

    json_files = sorted(dump_path.glob("Streaming_History_Audio_*.json"))
    if not json_files:
        inner = dump_path / "Spotify Extended Streaming History"
        if inner.is_dir():
            json_files = sorted(inner.glob("Streaming_History_Audio_*.json"))

    if not json_files:
        log.warning("No Streaming_History_Audio_*.json files found in %s", dump_path)
        return

    log.info("Found %d streaming history files in %s", len(json_files), dump_path)

    for jf in json_files:
        with open(jf, encoding="utf-8") as f:
            entries = json.load(f)

        for entry in entries:
            track_uri = entry.get("spotify_track_uri")
            episode_uri = entry.get("spotify_episode_uri")

            if track_uri:
                entry["_kind"] = "music"
            elif episode_uri:
                entry["_kind"] = "podcast"
            else:
                continue

            yield entry
