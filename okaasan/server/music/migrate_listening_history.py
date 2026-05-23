"""One-time migration: move listening history from main DB to per-year DBs.

Call ``migrate(engine, static_folder, on_progress=...)`` from a route or CLI.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path
from typing import Callable

from sqlalchemy import text, inspect as sa_inspect
from sqlalchemy.orm import Session, sessionmaker

log = logging.getLogger("okaasan.music.migrate_listening_history")

_BATCH_SIZE = 2000


def migrate(
    main_session_factory: sessionmaker,
    static_folder: str | Path,
    *,
    on_progress: Callable[[dict], None] | None = None,
) -> dict:
    """Move rows from the main DB's listening history tables to per-year DBs.

    Returns stats about the migration.
    """
    from .listening_db import (
        MusicListeningHistory,
        PodcastListeningHistory,
        get_year_session,
    )

    main_db: Session = main_session_factory()
    engine = main_db.get_bind()
    insp = sa_inspect(engine)

    stats = {
        "music_rows_migrated": 0,
        "podcast_rows_migrated": 0,
        "music_years": 0,
        "podcast_years": 0,
        "phase": "checking",
    }

    has_music = insp.has_table("music_listening_history")
    has_podcast = insp.has_table("podcast_listening_history")

    if not has_music and not has_podcast:
        stats["phase"] = "nothing_to_migrate"
        main_db.close()
        return stats

    year_sessions: dict[int, Session] = {}

    def _get_ydb(year: int) -> Session:
        if year not in year_sessions:
            SL = get_year_session(year, static_folder)
            year_sessions[year] = SL()
        return year_sessions[year]

    # -- Migrate music listening history ----------------------------------

    if has_music:
        stats["phase"] = "migrating_music"
        if on_progress:
            on_progress(stats)

        conn = engine.connect()
        result = conn.execute(text(
            "SELECT id, track_id, played_at, ms_played, spotify_track_uri, "
            "track_name, artist_name, album_name, platform, "
            "skipped, shuffle, offline, reason_start, reason_end, source "
            "FROM music_listening_history ORDER BY played_at"
        ))

        year_counts: dict[int, int] = defaultdict(int)
        pending: dict[int, int] = defaultdict(int)

        for row in result:
            played_at = row[2]
            if played_at is None:
                continue

            if hasattr(played_at, "year"):
                year = played_at.year
            else:
                try:
                    from datetime import datetime
                    played_at = datetime.fromisoformat(str(played_at))
                    year = played_at.year
                except Exception:
                    continue

            ydb = _get_ydb(year)
            ydb.add(MusicListeningHistory(
                track_id=row[1],
                played_at=played_at,
                ms_played=row[3],
                spotify_track_uri=row[4],
                track_name=row[5],
                artist_name=row[6],
                album_name=row[7],
                platform=row[8],
                skipped=row[9],
                shuffle=row[10],
                offline=row[11],
                reason_start=row[12],
                reason_end=row[13],
                source=row[14] or "spotify_import",
            ))

            year_counts[year] += 1
            pending[year] += 1
            stats["music_rows_migrated"] += 1

            if pending[year] >= _BATCH_SIZE:
                ydb.flush()
                pending[year] = 0

            if stats["music_rows_migrated"] % _BATCH_SIZE == 0 and on_progress:
                on_progress(stats)

        conn.close()
        stats["music_years"] = len(year_counts)

    # -- Migrate podcast listening history --------------------------------

    if has_podcast:
        stats["phase"] = "migrating_podcasts"
        if on_progress:
            on_progress(stats)

        conn = engine.connect()
        result = conn.execute(text(
            "SELECT id, podcast_id, episode_id, played_at, ms_played, "
            "spotify_episode_uri, episode_name, show_name, platform, "
            "skipped, source "
            "FROM podcast_listening_history ORDER BY played_at"
        ))

        year_counts = defaultdict(int)
        pending = defaultdict(int)

        for row in result:
            played_at = row[3]
            if played_at is None:
                continue

            if hasattr(played_at, "year"):
                year = played_at.year
            else:
                try:
                    from datetime import datetime
                    played_at = datetime.fromisoformat(str(played_at))
                    year = played_at.year
                except Exception:
                    continue

            ydb = _get_ydb(year)
            ydb.add(PodcastListeningHistory(
                podcast_id=row[1],
                episode_id=row[2],
                played_at=played_at,
                ms_played=row[4],
                spotify_episode_uri=row[5],
                episode_name=row[6],
                show_name=row[7],
                platform=row[8],
                skipped=row[9],
                source=row[10] or "spotify_import",
            ))

            year_counts[year] += 1
            pending[year] += 1
            stats["podcast_rows_migrated"] += 1

            if pending[year] >= _BATCH_SIZE:
                ydb.flush()
                pending[year] = 0

            if stats["podcast_rows_migrated"] % _BATCH_SIZE == 0 and on_progress:
                on_progress(stats)

        conn.close()
        stats["podcast_years"] = len(year_counts)

    # -- Commit all year sessions -----------------------------------------

    stats["phase"] = "committing"
    if on_progress:
        on_progress(stats)

    for year, ydb in year_sessions.items():
        try:
            ydb.commit()
        except Exception:
            ydb.rollback()
            raise
        finally:
            ydb.close()

    # -- Drop old tables from main DB and VACUUM --------------------------

    stats["phase"] = "cleaning"
    if on_progress:
        on_progress(stats)

    with engine.begin() as conn:
        if has_music:
            conn.execute(text("DROP TABLE IF EXISTS music_listening_history"))
        if has_podcast:
            conn.execute(text("DROP TABLE IF EXISTS podcast_listening_history"))

    with engine.connect() as conn:
        conn.execute(text("VACUUM"))

    main_db.close()

    stats["phase"] = "done"
    if on_progress:
        on_progress(stats)

    log.info(
        "Migration complete: %d music rows → %d years, %d podcast rows → %d years",
        stats["music_rows_migrated"], stats["music_years"],
        stats["podcast_rows_migrated"], stats["podcast_years"],
    )
    return stats
