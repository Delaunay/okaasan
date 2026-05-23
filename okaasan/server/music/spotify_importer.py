"""Import Spotify data dumps into the music database.

Supports:
- Extended Streaming History (``Streaming_History_Audio_*.json``)
- Account Data simple history (``StreamingHistory_music_*.json``)
- Playlists (``Playlist1.json``)
- Liked songs / library (``YourLibrary.json``)
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Callable

from sqlalchemy import func
from sqlalchemy.orm import Session

log = logging.getLogger("okaasan.music.spotify_importer")

_BATCH_SIZE = 500
_PROGRESS_INTERVAL = 2000


def _get_or_create_track(
    main_db: Session,
    track_cache: dict[str, int | None],
    stats: dict,
    *,
    uri: str | None,
    name: str | None,
    artist: str | None,
    album: str | None,
) -> int | None:
    """Find or create a MusicTrack, using URI and title+artist for dedup."""
    from .models import MusicTrack

    cache_key = uri or f"{name}||{artist}"
    if cache_key in track_cache:
        return track_cache[cache_key]

    if uri:
        existing = main_db.query(MusicTrack).filter(MusicTrack.spotify_id == uri).first()
        if existing:
            track_cache[cache_key] = existing.id
            stats["tracks_reused"] += 1
            return existing.id

    if name and artist:
        existing = (
            main_db.query(MusicTrack)
            .filter(MusicTrack.title == name, MusicTrack.artist == artist)
            .first()
        )
        if existing:
            if uri and not existing.spotify_id:
                existing.spotify_id = uri
            track_cache[cache_key] = existing.id
            stats["tracks_reused"] += 1
            return existing.id

    if not name:
        track_cache[cache_key] = None
        return None

    track = MusicTrack(
        title=name,
        artist=artist,
        album=album,
        spotify_id=uri,
    )
    main_db.add(track)
    main_db.flush()
    track_cache[cache_key] = track.id
    stats["tracks_created"] += 1
    return track.id


def import_spotify_data(
    main_db: Session,
    dump_dir: str | Path,
    *,
    static_folder: str | Path | None = None,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Import all Spotify streaming history from *dump_dir*.

    Tries Extended History first, falls back to simple Account Data format.
    Music/podcast play events are written to per-year SQLite databases.
    ``MusicTrack`` rows (get-or-create) and aggregated play counts are
    written to the *main_db*.

    Returns a stats dict.
    """
    from .spotify_parser import iter_play_events, iter_simple_play_events
    from .listening_db import (
        MusicListeningHistory,
        PodcastListeningHistory,
        get_year_session,
        iter_all_year_sessions,
    )

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

    # -- Load existing dedup keys from ALL year DBs -----------------------

    existing_music_keys: set[tuple] = set()
    existing_podcast_keys: set[tuple] = set()

    log.info("Loading existing listening history keys for dedup...")
    for _year, year_db in iter_all_year_sessions(static_folder):
        for uri, ts in year_db.query(
            MusicListeningHistory.spotify_track_uri,
            MusicListeningHistory.played_at,
        ).filter(MusicListeningHistory.source == "spotify_import"):
            existing_music_keys.add((uri, ts))

        for uri, ts in year_db.query(
            PodcastListeningHistory.spotify_episode_uri,
            PodcastListeningHistory.played_at,
        ).filter(PodcastListeningHistory.source == "spotify_import"):
            existing_podcast_keys.add((uri, ts))

    # Also load simple-import keys (dedup by name+artist+timestamp)
    existing_simple_keys: set[tuple] = set()
    for _year, year_db in iter_all_year_sessions(static_folder):
        for name, artist, ts in year_db.query(
            MusicListeningHistory.track_name,
            MusicListeningHistory.artist_name,
            MusicListeningHistory.played_at,
        ).filter(MusicListeningHistory.source == "spotify_simple_import"):
            existing_simple_keys.add((name, artist, ts))

    log.info(
        "Existing keys: %d music, %d podcast, %d simple",
        len(existing_music_keys), len(existing_podcast_keys), len(existing_simple_keys),
    )

    # -- Process events, partitioned by year ------------------------------

    year_sessions: dict[int, Session] = {}
    pending_counts: dict[int, int] = defaultdict(int)

    def _get_year_db(year: int) -> Session:
        if year not in year_sessions:
            SL = get_year_session(year, static_folder)
            year_sessions[year] = SL()
        return year_sessions[year]

    def _flush_year(year: int):
        if year in year_sessions:
            year_sessions[year].flush()
            pending_counts[year] = 0

    def _process_event(entry: dict):
        stats["total_processed"] += 1

        ts_str = entry.get("ts")
        if not ts_str:
            stats["errors"] += 1
            return
        try:
            played_at = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            # SQLite stores naive datetimes; strip tzinfo for dedup consistency
            played_at = played_at.replace(tzinfo=None)
        except ValueError:
            stats["errors"] += 1
            return

        year = played_at.year
        kind = entry["_kind"]
        is_simple = entry.get("_simple", False)

        if kind == "music":
            uri = entry.get("spotify_track_uri")
            track_name = entry.get("master_metadata_track_name")
            artist_name = entry.get("master_metadata_album_artist_name")

            if is_simple:
                if (track_name, artist_name, played_at) in existing_simple_keys:
                    stats["music_plays_skipped"] += 1
                    return
            else:
                if (uri, played_at) in existing_music_keys:
                    stats["music_plays_skipped"] += 1
                    return

            track_id = _get_or_create_track(
                main_db, track_cache, stats,
                uri=uri,
                name=track_name,
                artist=artist_name,
                album=entry.get("master_metadata_album_album_name"),
            )

            source = "spotify_simple_import" if is_simple else "spotify_import"
            ydb = _get_year_db(year)
            ydb.add(MusicListeningHistory(
                track_id=track_id,
                played_at=played_at,
                ms_played=entry.get("ms_played"),
                spotify_track_uri=uri,
                track_name=track_name,
                artist_name=artist_name,
                album_name=entry.get("master_metadata_album_album_name"),
                platform=entry.get("platform"),
                skipped=entry.get("skipped"),
                shuffle=entry.get("shuffle"),
                offline=entry.get("offline"),
                reason_start=entry.get("reason_start"),
                reason_end=entry.get("reason_end"),
                source=source,
            ))

            if is_simple:
                existing_simple_keys.add((track_name, artist_name, played_at))
            else:
                existing_music_keys.add((uri, played_at))
            stats["music_plays_imported"] += 1

        elif kind == "podcast":
            uri = entry.get("spotify_episode_uri")
            if (uri, played_at) in existing_podcast_keys:
                stats["podcast_plays_skipped"] += 1
                return

            ydb = _get_year_db(year)
            ydb.add(PodcastListeningHistory(
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

        pending_counts[year] += 1
        if pending_counts[year] >= _BATCH_SIZE:
            _flush_year(year)

        if stats["total_processed"] % _PROGRESS_INTERVAL == 0 and on_progress:
            on_progress(stats)

    # Try extended format first
    for entry in iter_play_events(dump_dir):
        _process_event(entry)

    # Then try simple format (will be deduped against existing)
    for entry in iter_simple_play_events(dump_dir):
        _process_event(entry)

    # -- Commit all year sessions -----------------------------------------

    for year, ydb in year_sessions.items():
        try:
            ydb.commit()
        except Exception:
            ydb.rollback()
            raise
        finally:
            ydb.close()

    # -- Aggregate play counts across all year DBs → main MusicTrack ------

    update_play_counts(main_db, static_folder)
    main_db.commit()

    log.info(
        "Spotify import done: %d music plays, %d podcast plays, %d tracks created, %d skipped",
        stats["music_plays_imported"],
        stats["podcast_plays_imported"],
        stats["tracks_created"],
        stats["music_plays_skipped"] + stats["podcast_plays_skipped"],
    )
    return stats


def import_spotify_playlists(
    main_db: Session,
    dump_dir: str | Path,
    *,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Import playlists from ``Playlist1.json`` and liked songs from ``YourLibrary.json``.

    Creates ``MusicPlaylist`` / ``MusicPlaylistItem`` rows and
    get-or-creates ``MusicTrack`` rows for each song.
    """
    from .spotify_parser import parse_playlists, parse_library
    from .models import MusicTrack, MusicPlaylist, MusicPlaylistItem

    stats = {
        "tracks_created": 0,
        "tracks_reused": 0,
        "playlists_created": 0,
        "playlists_skipped": 0,
        "playlist_items_added": 0,
        "liked_tracks_imported": 0,
        "liked_tracks_skipped": 0,
    }
    track_cache: dict[str, int | None] = {}

    # -- Import playlists --------------------------------------------------

    playlists = parse_playlists(dump_dir)
    for pl_data in playlists:
        name = pl_data["name"]
        items = pl_data["items"]
        if not items:
            stats["playlists_skipped"] += 1
            continue

        existing_pl = main_db.query(MusicPlaylist).filter(
            MusicPlaylist.name == name,
        ).first()
        if existing_pl:
            stats["playlists_skipped"] += 1
            continue

        playlist = MusicPlaylist(name=name)
        main_db.add(playlist)
        main_db.flush()
        stats["playlists_created"] += 1

        for pos, item in enumerate(items, 1):
            track_id = _get_or_create_track(
                main_db, track_cache, stats,
                uri=item.get("trackUri"),
                name=item["trackName"],
                artist=item.get("artistName"),
                album=item.get("albumName"),
            )
            if track_id is None:
                continue

            main_db.add(MusicPlaylistItem(
                playlist_id=playlist.id,
                track_id=track_id,
                position=pos,
            ))
            stats["playlist_items_added"] += 1

        main_db.flush()

        if on_progress:
            on_progress(stats)

    # -- Import liked songs -----------------------------------------------

    library = parse_library(dump_dir)
    liked_tracks = library.get("tracks", [])

    if liked_tracks:
        liked_pl = main_db.query(MusicPlaylist).filter(
            MusicPlaylist.name == "Liked Songs",
        ).first()
        if not liked_pl:
            liked_pl = MusicPlaylist(name="Liked Songs")
            main_db.add(liked_pl)
            main_db.flush()
            stats["playlists_created"] += 1

        existing_track_ids = set(
            r[0] for r in main_db.query(MusicPlaylistItem.track_id).filter(
                MusicPlaylistItem.playlist_id == liked_pl.id
            ).all()
        )

        max_pos = (
            main_db.query(func.max(MusicPlaylistItem.position))
            .filter_by(playlist_id=liked_pl.id)
            .scalar() or 0
        )

        for item in liked_tracks:
            track_id = _get_or_create_track(
                main_db, track_cache, stats,
                uri=item.get("uri"),
                name=item.get("track"),
                artist=item.get("artist"),
                album=item.get("album"),
            )
            if track_id is None:
                stats["liked_tracks_skipped"] += 1
                continue
            if track_id in existing_track_ids:
                stats["liked_tracks_skipped"] += 1
                continue

            max_pos += 1
            main_db.add(MusicPlaylistItem(
                playlist_id=liked_pl.id,
                track_id=track_id,
                position=max_pos,
            ))
            existing_track_ids.add(track_id)
            stats["liked_tracks_imported"] += 1

        main_db.flush()

    main_db.commit()

    log.info(
        "Spotify playlist import done: %d playlists, %d items, %d liked tracks, %d tracks created",
        stats["playlists_created"],
        stats["playlist_items_added"],
        stats["liked_tracks_imported"],
        stats["tracks_created"],
    )
    return stats


def update_play_counts(main_db: Session, static_folder: str | Path | None = None) -> None:
    """Recompute MusicTrack.play_count / last_played_at from all year DBs."""
    from .models import MusicTrack
    from .listening_db import MusicListeningHistory, iter_all_year_sessions

    totals: dict[int, dict] = {}  # track_id → {count, last}

    for _year, ydb in iter_all_year_sessions(static_folder):
        rows = (
            ydb.query(
                MusicListeningHistory.track_id,
                func.count().label("cnt"),
                func.max(MusicListeningHistory.played_at).label("last"),
            )
            .filter(MusicListeningHistory.track_id.isnot(None))
            .group_by(MusicListeningHistory.track_id)
            .all()
        )
        for track_id, cnt, last in rows:
            if track_id not in totals:
                totals[track_id] = {"count": 0, "last": None}
            totals[track_id]["count"] += cnt
            if last and (totals[track_id]["last"] is None or last > totals[track_id]["last"]):
                totals[track_id]["last"] = last

    for track_id, agg in totals.items():
        track = main_db.get(MusicTrack, track_id)
        if track:
            track.play_count = agg["count"]
            track.last_played_at = agg["last"]

    main_db.flush()
