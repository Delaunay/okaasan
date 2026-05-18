"""Import Spotify Extended Streaming History into the database."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy.orm import Session

log = logging.getLogger("okaasan.music.spotify_importer")

_BATCH_SIZE = 500
_PROGRESS_INTERVAL = 2000


def import_spotify_data(
    db: Session,
    dump_dir: str | Path,
    *,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Import all Spotify streaming history from *dump_dir*.

    Returns a stats dict with counts of created/skipped records.
    """
    from .spotify_parser import iter_play_events
    from .models import MusicTrack, MusicListeningHistory
    from ..podcasts.models import PodcastListeningHistory

    stats = {
        "tracks_created": 0,
        "tracks_reused": 0,
        "music_plays_imported": 0,
        "music_plays_skipped": 0,
        "podcast_plays_imported": 0,
        "podcast_plays_skipped": 0,
        "total_processed": 0,
        "errors": 0,
    }

    track_cache: dict[str, int | None] = {}

    def _get_or_create_track(uri: str, name: str | None, artist: str | None, album: str | None) -> int | None:
        if uri in track_cache:
            return track_cache[uri]

        existing = db.query(MusicTrack).filter(MusicTrack.spotify_id == uri).first()
        if existing:
            track_cache[uri] = existing.id
            stats["tracks_reused"] += 1
            return existing.id

        if name and artist:
            existing = (
                db.query(MusicTrack)
                .filter(MusicTrack.title == name, MusicTrack.artist == artist)
                .first()
            )
            if existing:
                if not existing.spotify_id:
                    existing.spotify_id = uri
                track_cache[uri] = existing.id
                stats["tracks_reused"] += 1
                return existing.id

        if not name:
            track_cache[uri] = None
            return None

        track = MusicTrack(
            title=name,
            artist=artist,
            album=album,
            spotify_id=uri,
        )
        db.add(track)
        db.flush()
        track_cache[uri] = track.id
        stats["tracks_created"] += 1
        return track.id

    existing_music_keys: set[tuple] = set()
    existing_podcast_keys: set[tuple] = set()

    def _load_existing_keys():
        for uri, ts in db.query(
            MusicListeningHistory.spotify_track_uri,
            MusicListeningHistory.played_at,
        ).filter(MusicListeningHistory.source == "spotify_import"):
            existing_music_keys.add((uri, ts))

        for uri, ts in db.query(
            PodcastListeningHistory.spotify_episode_uri,
            PodcastListeningHistory.played_at,
        ).filter(PodcastListeningHistory.source == "spotify_import"):
            existing_podcast_keys.add((uri, ts))

    log.info("Loading existing listening history keys for dedup...")
    _load_existing_keys()
    log.info("Existing keys: %d music, %d podcast", len(existing_music_keys), len(existing_podcast_keys))

    pending_count = 0

    for entry in iter_play_events(dump_dir):
        stats["total_processed"] += 1

        ts_str = entry.get("ts")
        if not ts_str:
            stats["errors"] += 1
            continue
        try:
            played_at = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except ValueError:
            stats["errors"] += 1
            continue

        kind = entry["_kind"]

        if kind == "music":
            uri = entry.get("spotify_track_uri")
            if (uri, played_at) in existing_music_keys:
                stats["music_plays_skipped"] += 1
                continue

            track_id = _get_or_create_track(
                uri,
                entry.get("master_metadata_track_name"),
                entry.get("master_metadata_album_artist_name"),
                entry.get("master_metadata_album_album_name"),
            )

            db.add(MusicListeningHistory(
                track_id=track_id,
                played_at=played_at,
                ms_played=entry.get("ms_played"),
                spotify_track_uri=uri,
                track_name=entry.get("master_metadata_track_name"),
                artist_name=entry.get("master_metadata_album_artist_name"),
                album_name=entry.get("master_metadata_album_album_name"),
                platform=entry.get("platform"),
                skipped=entry.get("skipped"),
                shuffle=entry.get("shuffle"),
                offline=entry.get("offline"),
                reason_start=entry.get("reason_start"),
                reason_end=entry.get("reason_end"),
                source="spotify_import",
            ))
            existing_music_keys.add((uri, played_at))
            stats["music_plays_imported"] += 1

        elif kind == "podcast":
            uri = entry.get("spotify_episode_uri")
            if (uri, played_at) in existing_podcast_keys:
                stats["podcast_plays_skipped"] += 1
                continue

            db.add(PodcastListeningHistory(
                played_at=played_at,
                ms_played=entry.get("ms_played"),
                spotify_episode_uri=uri,
                episode_name=entry.get("episode_name"),
                show_name=entry.get("episode_show_name"),
                platform=entry.get("platform"),
                skipped=entry.get("skipped"),
                source="spotify_import",
            ))
            existing_podcast_keys.add((uri, played_at))
            stats["podcast_plays_imported"] += 1

        pending_count += 1

        if pending_count >= _BATCH_SIZE:
            db.flush()
            pending_count = 0

        if stats["total_processed"] % _PROGRESS_INTERVAL == 0 and on_progress:
            on_progress(stats)

    if pending_count:
        db.flush()

    _update_play_counts(db)

    db.commit()
    log.info(
        "Spotify import done: %d music plays, %d podcast plays, %d tracks created, %d skipped",
        stats["music_plays_imported"],
        stats["podcast_plays_imported"],
        stats["tracks_created"],
        stats["music_plays_skipped"] + stats["podcast_plays_skipped"],
    )
    return stats


def _update_play_counts(db: Session) -> None:
    """Recompute play_count and last_played_at on MusicTrack from listening history."""
    from sqlalchemy import func
    from .models import MusicTrack, MusicListeningHistory

    subq = (
        db.query(
            MusicListeningHistory.track_id,
            func.count().label("cnt"),
            func.max(MusicListeningHistory.played_at).label("last"),
        )
        .filter(MusicListeningHistory.track_id.isnot(None))
        .group_by(MusicListeningHistory.track_id)
        .subquery()
    )

    for track_id, cnt, last in db.query(subq.c.track_id, subq.c.cnt, subq.c.last):
        track = db.get(MusicTrack, track_id)
        if track:
            track.play_count = cnt
            track.last_played_at = last

    db.flush()
