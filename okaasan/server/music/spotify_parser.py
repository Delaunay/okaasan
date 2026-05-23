"""Parse Spotify data dump JSON files.

Handles both the *Extended Streaming History* format
(``Streaming_History_Audio_*.json``) and the *Account Data* simple format
(``StreamingHistory_music_*.json``).
"""
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


def iter_simple_play_events(dump_dir: str | Path) -> Iterator[dict]:
    """Yield play events from the Account Data simple format.

    Files are named ``StreamingHistory_music_*.json`` and contain::

        {"endTime": "2025-05-18 00:16", "artistName": "...",
         "trackName": "...", "msPlayed": 71266}

    Each yielded dict is normalised to the extended-history shape so the
    importer can consume both formats uniformly.
    """
    dump_path = Path(dump_dir)
    candidates = [dump_path]

    inner = dump_path / "Spotify Account Data"
    if inner.is_dir():
        candidates.append(inner)

    json_files: list[Path] = []
    for d in candidates:
        json_files.extend(sorted(d.glob("StreamingHistory_music_*.json")))

    if not json_files:
        log.warning("No StreamingHistory_music_*.json files found in %s", dump_path)
        return

    log.info("Found %d simple streaming history files in %s", len(json_files), dump_path)

    for jf in json_files:
        with open(jf, encoding="utf-8") as f:
            entries = json.load(f)

        for entry in entries:
            end_time = entry.get("endTime")
            track_name = entry.get("trackName")
            artist_name = entry.get("artistName")
            ms_played = entry.get("msPlayed", 0)

            if not track_name or not end_time:
                continue

            yield {
                "ts": end_time.replace(" ", "T") + "Z",
                "master_metadata_track_name": track_name,
                "master_metadata_album_artist_name": artist_name,
                "master_metadata_album_album_name": None,
                "ms_played": ms_played,
                "spotify_track_uri": None,
                "_kind": "music",
                "_simple": True,
            }


def parse_playlists(dump_dir: str | Path) -> list[dict]:
    """Parse ``Playlist1.json`` from the Spotify Account Data export.

    Returns a list of playlists, each with ``name``, ``lastModifiedDate``,
    and ``items`` (list of dicts with ``trackName``, ``artistName``,
    ``albumName``, ``trackUri``, ``addedDate``).
    """
    dump_path = Path(dump_dir)
    for candidate in [
        dump_path / "Playlist1.json",
        dump_path / "Spotify Account Data" / "Playlist1.json",
    ]:
        if candidate.is_file():
            with open(candidate, encoding="utf-8") as f:
                data = json.load(f)
            raw_playlists = data.get("playlists", [])
            result = []
            for pl in raw_playlists:
                items = []
                for item in pl.get("items", []):
                    track = item.get("track") or {}
                    if not track.get("trackName"):
                        continue
                    items.append({
                        "trackName": track["trackName"],
                        "artistName": track.get("artistName"),
                        "albumName": track.get("albumName"),
                        "trackUri": track.get("trackUri"),
                        "addedDate": item.get("addedDate"),
                    })
                result.append({
                    "name": pl.get("name", "Untitled"),
                    "lastModifiedDate": pl.get("lastModifiedDate"),
                    "items": items,
                })
            return result
    log.warning("Playlist1.json not found in %s", dump_path)
    return []


def parse_library(dump_dir: str | Path) -> dict:
    """Parse ``YourLibrary.json`` from the Spotify Account Data export.

    Returns a dict with ``tracks`` (list of dicts with ``track``,
    ``artist``, ``album``, ``uri``), ``albums``, and ``artists``.
    """
    dump_path = Path(dump_dir)
    for candidate in [
        dump_path / "YourLibrary.json",
        dump_path / "Spotify Account Data" / "YourLibrary.json",
    ]:
        if candidate.is_file():
            with open(candidate, encoding="utf-8") as f:
                data = json.load(f)
            return {
                "tracks": data.get("tracks", []),
                "albums": data.get("albums", []),
                "artists": data.get("artists", []),
            }
    log.warning("YourLibrary.json not found in %s", dump_path)
    return {"tracks": [], "albums": [], "artists": []}
