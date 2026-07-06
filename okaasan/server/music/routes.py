"""API routes for Music section."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from sqlalchemy import select

from .models import MusicTrack, MusicPlaylist, MusicPlaylistItem, MusicEvent
from .metadata import MusicBrainzClient
from ..decorators import expose
from ..paths import public_folder, cache_folder

log = logging.getLogger("okaasan.music")

router = APIRouter(prefix="/music", tags=["music"])

_mb_client: MusicBrainzClient | None = None
_music_scanner = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


def _get_private_db(request: Request):
    from sqlalchemy.orm import sessionmaker
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        yield db
    finally:
        db.close()


def _get_mb(request: Request) -> MusicBrainzClient:
    global _mb_client
    if _mb_client is None:
        _mb_client = MusicBrainzClient(
            cache_folder() / "music" / "mb",
            public_folder() / "data" / "music" / "covers",
        )
    return _mb_client


def _clear_failed_cover_cache(request: Request):
    """Remove zero-byte marker files from covers dir so failed lookups are retried."""
    mb = _get_mb(request)
    removed = 0
    for f in mb.covers_dir.iterdir():
        if f.is_file() and f.stat().st_size == 0:
            f.unlink()
            removed += 1
    if removed:
        log.info("Cleared %d failed cover art cache markers", removed)


# ── Library management ─────────────────────────────────────────────

@router.get("/library/status")
def library_status(request: Request):
    """Get music library scan status and stats."""
    from .library import load_config
    from .library_models import MusicFile
    from sqlalchemy.orm import sessionmaker

    config = load_config(request.app.state.static_folder)
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        total = db.query(MusicFile).count()
        matched = db.query(MusicFile).filter_by(matched=True).count()
    finally:
        db.close()

    global _music_scanner
    last_scan = _music_scanner.last_scan.isoformat() + "Z" if _music_scanner and _music_scanner.last_scan else None

    return {
        "configured": bool(config.get("folders")),
        "folders": config.get("folders", []),
        "total_files": total,
        "matched_files": matched,
        "unmatched_files": total - matched,
        "last_scan": last_scan,
        "scan_interval_minutes": config.get("scan_interval_minutes", 60),
        "metadata_enabled": config.get("metadata_enabled", False),
        "fetch_covers": config.get("fetch_covers", True),
        "contact_email": config.get("contact_email", ""),
    }


@router.post("/library/configure")
async def library_configure(request: Request):
    """Save music library folder configuration."""
    from .library import save_config, load_config
    data = await request.json()

    config = load_config(request.app.state.static_folder)
    if "folders" in data:
        config["folders"] = data["folders"]
    if "scan_interval_minutes" in data:
        config["scan_interval_minutes"] = data["scan_interval_minutes"]
    if "extensions" in data:
        config["extensions"] = data["extensions"]
    if "metadata_enabled" in data:
        config["metadata_enabled"] = bool(data["metadata_enabled"])
    if "fetch_covers" in data:
        config["fetch_covers"] = bool(data["fetch_covers"])
    if "contact_email" in data:
        config["contact_email"] = data["contact_email"]
    if "ignored_artists" in data:
        config["ignored_artists"] = [a for a in data["ignored_artists"] if isinstance(a, str) and a.strip()]

    save_config(request.app.state.static_folder, config)
    return {"message": "Configuration saved", "config": config}


@router.post("/library/scan")
async def library_scan(request: Request):
    """Trigger a manual music library scan. Pass {"force": true} to re-scan all files."""
    data = {}
    try:
        data = await request.json()
    except Exception:
        pass

    if data.get("force"):
        from .library_models import MusicFile
        from sqlalchemy.orm import sessionmaker
        private_engine = request.app.state.private_engine
        PrivateSession = sessionmaker(bind=private_engine)
        pdb = PrivateSession()
        try:
            deleted = pdb.query(MusicFile).delete()
            pdb.commit()
            log.info("Force re-scan: cleared %d existing file entries", deleted)
        finally:
            pdb.close()

    import asyncio
    global _music_scanner
    if _music_scanner:
        result = await asyncio.to_thread(_music_scanner.scan_now)
    else:
        from .library import scan_folders
        from sqlalchemy import create_engine
        static_folder = request.app.state.static_folder
        private_engine = request.app.state.private_engine
        db_path = os.path.join(static_folder, "database.db")
        main_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        result = await asyncio.to_thread(scan_folders, static_folder, private_engine, main_engine)

    return {"message": "Scan complete", **result}


@router.get("/library/all-files")
def library_all_files(request: Request, db: Session = Depends(_get_db)):
    """Get all music library files, enriched with track info for matched items."""
    from .library_models import MusicFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        files = pdb.query(MusicFile).order_by(
            MusicFile.artist, MusicFile.album, MusicFile.title
        ).all()
        raw = [f.to_json() for f in files]
    finally:
        pdb.close()

    track_ids = {f["track_id"] for f in raw if f["track_id"]}
    if track_ids:
        tracks = db.query(MusicTrack).filter(MusicTrack.id.in_(track_ids)).all()
        track_map = {t.id: t for t in tracks}
    else:
        track_map = {}

    for f in raw:
        tid = f.get("track_id")
        if tid and tid in track_map:
            t = track_map[tid]
            f["cover_path"] = t.cover_path
            f["genre"] = t.genre
            f["year"] = t.year
        else:
            f["cover_path"] = None
            f["genre"] = None
            f["year"] = None

    return {"files": raw}


# ── Ignored artists ────────────────────────────────────────────────

@router.get("/ignored-artists")
def get_ignored_artists_endpoint(request: Request):
    """Return the list of artists hidden from stats and display."""
    from .library import get_ignored_artists
    return {"artists": get_ignored_artists(request.app.state.static_folder)}


@router.put("/ignored-artists")
async def set_ignored_artists(request: Request):
    """Replace the ignored artists list. Body: {"artists": ["Name", ...]}"""
    from .library import load_config, save_config
    data = await request.json()
    artists = data.get("artists", [])
    if not isinstance(artists, list):
        raise HTTPException(status_code=400, detail="artists must be a list of strings")

    config = load_config(request.app.state.static_folder)
    config["ignored_artists"] = [a for a in artists if isinstance(a, str) and a.strip()]
    save_config(request.app.state.static_folder, config)
    return {"artists": config["ignored_artists"]}


def _ignored_artist_set(request: Request) -> set[str]:
    """Return lowercase set of ignored artist names for fast filtering."""
    from .library import get_ignored_artists
    return {a.lower() for a in get_ignored_artists(request.app.state.static_folder)}


# ── Overview & Library (aggregate endpoints) ──────────────────────

def _normalize_cover(cover_path: str | None, static_folder: str) -> str | None:
    """Ensure cover_path is relative (e.g. 'uploads/data/music/covers/x.jpg')."""
    if not cover_path:
        return None
    sf = static_folder.rstrip("/") + "/"
    if cover_path.startswith(sf):
        return cover_path[len(sf):]
    if cover_path.startswith("uploads/"):
        return cover_path
    return cover_path


_static_folder_cache: str = ""


def _track_to_frontend(t, static_folder: str = "", *, has_local_file: bool | None = None) -> dict:
    """Convert a MusicTrack ORM object to the frontend MusicTrack shape."""
    d = t.to_json()
    d["duration"] = (d.pop("duration_ms", 0) or 0) / 1000.0
    d["album_id"] = None
    sf = static_folder or _static_folder_cache
    if sf:
        d["cover_path"] = _normalize_cover(d.get("cover_path"), sf)
    if has_local_file is not None:
        d["has_local_file"] = has_local_file
    return d


def _get_local_file_track_ids(private_engine) -> set[int]:
    """Return the set of MusicTrack IDs that have a linked MusicFile."""
    from .library_models import MusicFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=private_engine)
    db = PrivateSession()
    try:
        rows = db.query(MusicFile.track_id).filter(
            MusicFile.track_id.isnot(None),
            MusicFile.matched == True,  # noqa: E712
        ).all()
        return {r[0] for r in rows}
    finally:
        db.close()


def _enrich_tracks_with_local_flag(tracks: list[dict], local_ids: set[int]) -> list[dict]:
    """Add ``has_local_file`` bool to each track dict in-place."""
    for t in tracks:
        t["has_local_file"] = t.get("id") in local_ids
    return tracks


@router.get("/overview")
def music_overview(request: Request, db: Session = Depends(_get_db)):
    """Aggregated overview: stats, genres, top artists, random picks, recent albums."""
    import random

    sf = request.app.state.static_folder
    local_ids = _get_local_file_track_ids(request.app.state.private_engine)
    ignored = _ignored_artist_set(request)

    base = db.query(MusicTrack)
    if ignored:
        base = base.filter(func.lower(MusicTrack.artist).notin_(ignored))

    total_tracks = base.with_entities(func.count(MusicTrack.id)).scalar() or 0
    total_albums = base.with_entities(func.count(func.distinct(MusicTrack.album))).filter(
        MusicTrack.album.isnot(None), MusicTrack.album != ""
    ).scalar() or 0
    total_artists = base.with_entities(func.count(func.distinct(MusicTrack.artist))).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != ""
    ).scalar() or 0
    total_playlists = db.query(func.count(MusicPlaylist.id)).scalar() or 0

    # Genre breakdown
    genre_q = base.with_entities(
        MusicTrack.genre,
        func.count(MusicTrack.id).label("count"),
    ).filter(
        MusicTrack.genre.isnot(None), MusicTrack.genre != ""
    ).group_by(MusicTrack.genre).order_by(desc("count")).limit(20).all()
    genres = [{"name": g.genre, "count": g.count} for g in genre_q]

    # Top artists
    top_artists_q = base.with_entities(
        MusicTrack.artist,
        func.count(MusicTrack.id).label("track_count"),
        func.count(func.distinct(MusicTrack.album)).label("album_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
    ).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != ""
    ).group_by(MusicTrack.artist).order_by(desc("track_count")).limit(12).all()
    top_artists = [
        {"name": a.artist, "track_count": a.track_count, "album_count": a.album_count, "cover_path": _normalize_cover(a.cover_path, sf)}
        for a in top_artists_q
    ]

    # Random picks (exclude ignored artists)
    random_tracks = []
    if total_tracks > 0:
        all_ids = [r[0] for r in base.with_entities(MusicTrack.id).all()]
        pick_ids = random.sample(all_ids, min(20, len(all_ids)))
        picks = db.query(MusicTrack).filter(MusicTrack.id.in_(pick_ids)).all()
        random_tracks = _enrich_tracks_with_local_flag(
            [_track_to_frontend(t, sf) for t in picks], local_ids
        )

    # Recent albums
    recent_albums_q = base.with_entities(
        MusicTrack.album,
        MusicTrack.album_artist,
        MusicTrack.year,
        func.count(MusicTrack.id).label("track_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
        func.max(MusicTrack.created_at).label("added"),
    ).filter(
        MusicTrack.album.isnot(None), MusicTrack.album != ""
    ).group_by(MusicTrack.album, MusicTrack.album_artist).order_by(desc("added")).limit(10).all()
    recent_albums = [
        {"name": a.album, "artist": a.album_artist or "", "year": a.year, "track_count": a.track_count, "cover_path": _normalize_cover(a.cover_path, sf)}
        for a in recent_albums_q
    ]

    return {
        "stats": {
            "total_tracks": total_tracks,
            "total_albums": total_albums,
            "total_artists": total_artists,
            "total_playlists": total_playlists,
        },
        "genres": genres,
        "top_artists": top_artists,
        "random_tracks": random_tracks,
        "recent_albums": recent_albums,
    }


@router.get("/library")
def music_library(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    group_by: str = Query("artist"),
    search: str | None = Query(None, alias="q"),
    db: Session = Depends(_get_db),
):
    """Paginated library grouped by artist or album."""
    sf = request.app.state.static_folder
    local_ids = _get_local_file_track_ids(request.app.state.private_engine)
    ignored = _ignored_artist_set(request)

    base_q = db.query(MusicTrack)
    if ignored:
        base_q = base_q.filter(func.lower(MusicTrack.artist).notin_(ignored))
    if search and search.strip():
        term = f"%{search.strip()}%"
        base_q = base_q.filter(
            MusicTrack.title.ilike(term)
            | MusicTrack.artist.ilike(term)
            | MusicTrack.album.ilike(term)
        )

    total_tracks = base_q.count()

    if group_by == "album":
        groups_q = base_q.with_entities(
            MusicTrack.album,
            MusicTrack.album_artist,
            func.count(MusicTrack.id).label("track_count"),
            func.min(MusicTrack.cover_path).label("cover_path"),
        ).filter(
            MusicTrack.album.isnot(None), MusicTrack.album != ""
        ).group_by(MusicTrack.album, MusicTrack.album_artist).order_by(MusicTrack.album)

        total_groups = groups_q.count()
        group_rows = groups_q.offset((page - 1) * per_page).limit(per_page).all()

        groups = []
        for row in group_rows:
            tracks = (
                base_q.filter(MusicTrack.album == row.album)
                .order_by(MusicTrack.disc_number, MusicTrack.track_number)
                .all()
            )
            groups.append({
                "name": row.album or "Unknown Album",
                "subtitle": f"{row.album_artist or 'Various'} · {row.track_count} tracks",
                "cover_path": _normalize_cover(row.cover_path, sf),
                "track_count": row.track_count,
                "tracks": _enrich_tracks_with_local_flag(
                    [_track_to_frontend(t, sf) for t in tracks], local_ids
                ),
            })
    else:
        groups_q = base_q.with_entities(
            MusicTrack.artist,
            func.count(MusicTrack.id).label("track_count"),
            func.count(func.distinct(MusicTrack.album)).label("album_count"),
            func.min(MusicTrack.cover_path).label("cover_path"),
        ).filter(
            MusicTrack.artist.isnot(None), MusicTrack.artist != ""
        ).group_by(MusicTrack.artist).order_by(MusicTrack.artist)

        total_groups = groups_q.count()
        group_rows = groups_q.offset((page - 1) * per_page).limit(per_page).all()

        groups = []
        for row in group_rows:
            tracks = (
                base_q.filter(MusicTrack.artist == row.artist)
                .order_by(MusicTrack.album, MusicTrack.track_number)
                .all()
            )
            groups.append({
                "name": row.artist or "Unknown Artist",
                "subtitle": f"{row.album_count} albums · {row.track_count} tracks",
                "cover_path": _normalize_cover(row.cover_path, sf),
                "track_count": row.track_count,
                "tracks": _enrich_tracks_with_local_flag(
                    [_track_to_frontend(t, sf) for t in tracks], local_ids
                ),
            })

    return {
        "groups": groups,
        "total_groups": total_groups,
        "total_tracks": total_tracks,
        "page": page,
        "per_page": per_page,
        "has_more": page * per_page < total_groups,
    }


# ── Tracks ─────────────────────────────────────────────────────────

@router.get("/tracks")
def list_tracks(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, alias="q"),
    artist: str | None = Query(None),
    album: str | None = Query(None),
    genre: str | None = Query(None),
    db: Session = Depends(_get_db),
):
    """List all tracks with pagination, search, and filters."""
    sf = request.app.state.static_folder
    local_ids = _get_local_file_track_ids(request.app.state.private_engine)
    ignored = _ignored_artist_set(request)

    q = db.query(MusicTrack)
    if ignored:
        q = q.filter(func.lower(MusicTrack.artist).notin_(ignored))

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            MusicTrack.title.ilike(term)
            | MusicTrack.artist.ilike(term)
            | MusicTrack.album.ilike(term)
        )
    if artist:
        q = q.filter(MusicTrack.artist.ilike(f"%{artist}%"))
    if album:
        q = q.filter(MusicTrack.album.ilike(f"%{album}%"))
    if genre:
        q = q.filter(MusicTrack.genre.ilike(f"%{genre}%"))

    total = q.count()
    items = (
        q.order_by(MusicTrack.artist, MusicTrack.album, MusicTrack.track_number)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "items": _enrich_tracks_with_local_flag(
            [_track_to_frontend(t, sf) for t in items], local_ids
        ),
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@router.get("/tracks/{track_id}")
def get_track(request: Request, track_id: int, db: Session = Depends(_get_db)):
    """Get a single track by ID."""
    sf = request.app.state.static_folder
    local_ids = _get_local_file_track_ids(request.app.state.private_engine)
    track = db.query(MusicTrack).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    d = _track_to_frontend(track, sf)
    d["has_local_file"] = track.id in local_ids
    return d


@router.post("/tracks/{track_id}/play")
def record_play(request: Request, track_id: int, db: Session = Depends(_get_db)):
    """Increment play count for a track."""
    from datetime import datetime, timezone
    track = db.query(MusicTrack).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    track.play_count = (track.play_count or 0) + 1
    track.last_played_at = datetime.now(timezone.utc)
    db.commit()
    return {"play_count": track.play_count}


# ── Stats ──────────────────────────────────────────────────────────

@router.get("/stats")
@expose()
def music_stats(request: Request, db: Session = Depends(_get_db)):
    """Music listening statistics and metadata breakdown."""
    sf = request.app.state.static_folder
    local_ids = _get_local_file_track_ids(request.app.state.private_engine)
    ignored = _ignored_artist_set(request)

    base = db.query(MusicTrack)
    if ignored:
        base = base.filter(func.lower(MusicTrack.artist).notin_(ignored))

    total_tracks = base.with_entities(func.count(MusicTrack.id)).scalar() or 0
    total_plays = base.with_entities(func.sum(MusicTrack.play_count)).scalar() or 0
    total_duration_ms = base.with_entities(func.sum(MusicTrack.duration_ms)).scalar() or 0
    total_listening_ms = base.with_entities(
        func.sum(MusicTrack.duration_ms * MusicTrack.play_count)
    ).scalar() or 0

    # Most played tracks
    most_played = base.filter(
        MusicTrack.play_count > 0
    ).order_by(desc(MusicTrack.play_count)).limit(20).all()

    # Most played artists
    top_artists_plays = base.with_entities(
        MusicTrack.artist,
        func.sum(MusicTrack.play_count).label("total_plays"),
        func.count(MusicTrack.id).label("track_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
    ).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != "",
        MusicTrack.play_count > 0
    ).group_by(MusicTrack.artist).order_by(desc("total_plays")).limit(15).all()

    # Most played albums
    top_albums_plays = base.with_entities(
        MusicTrack.album,
        MusicTrack.album_artist,
        func.sum(MusicTrack.play_count).label("total_plays"),
        func.count(MusicTrack.id).label("track_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
    ).filter(
        MusicTrack.album.isnot(None), MusicTrack.album != "",
        MusicTrack.play_count > 0
    ).group_by(MusicTrack.album, MusicTrack.album_artist).order_by(desc("total_plays")).limit(15).all()

    # Genre distribution
    genre_dist = base.with_entities(
        MusicTrack.genre,
        func.count(MusicTrack.id).label("track_count"),
        func.sum(MusicTrack.play_count).label("total_plays"),
        func.sum(MusicTrack.duration_ms).label("total_duration_ms"),
    ).filter(
        MusicTrack.genre.isnot(None), MusicTrack.genre != ""
    ).group_by(MusicTrack.genre).order_by(desc("track_count")).limit(20).all()

    # Year distribution
    year_dist = base.with_entities(
        MusicTrack.year,
        func.count(MusicTrack.id).label("track_count"),
        func.sum(MusicTrack.play_count).label("total_plays"),
    ).filter(
        MusicTrack.year.isnot(None)
    ).group_by(MusicTrack.year).order_by(MusicTrack.year).all()

    # Recently played
    recently_played = base.filter(
        MusicTrack.last_played_at.isnot(None)
    ).order_by(desc(MusicTrack.last_played_at)).limit(20).all()

    # Unplayed tracks count
    unplayed_count = base.with_entities(func.count(MusicTrack.id)).filter(
        (MusicTrack.play_count == 0) | (MusicTrack.play_count.is_(None))
    ).scalar() or 0

    return {
        "summary": {
            "total_tracks": total_tracks,
            "total_plays": total_plays,
            "total_duration_ms": total_duration_ms,
            "total_listening_ms": total_listening_ms,
            "unplayed_count": unplayed_count,
        },
        "most_played": _enrich_tracks_with_local_flag(
            [_track_to_frontend(t, sf) for t in most_played], local_ids
        ),
        "recently_played": _enrich_tracks_with_local_flag(
            [_track_to_frontend(t, sf) for t in recently_played], local_ids
        ),
        "top_artists": [
            {"name": a.artist, "total_plays": a.total_plays, "track_count": a.track_count, "cover_path": _normalize_cover(a.cover_path, sf)}
            for a in top_artists_plays
        ],
        "top_albums": [
            {"name": a.album, "artist": a.album_artist or "", "total_plays": a.total_plays, "track_count": a.track_count, "cover_path": _normalize_cover(a.cover_path, sf)}
            for a in top_albums_plays
        ],
        "genres": [
            {"name": g.genre, "track_count": g.track_count, "total_plays": g.total_plays or 0, "total_duration_ms": g.total_duration_ms or 0}
            for g in genre_dist
        ],
        "years": [
            {"year": y.year, "track_count": y.track_count, "total_plays": y.total_plays or 0}
            for y in year_dist
        ],
    }


# ── Albums ─────────────────────────────────────────────────────────

@router.get("/albums")
def list_albums(
    request: Request,
    search: str | None = Query(None, alias="q"),
    db: Session = Depends(_get_db),
):
    """List unique albums with track counts."""
    sf = request.app.state.static_folder
    ignored = _ignored_artist_set(request)

    q = db.query(
        MusicTrack.album,
        MusicTrack.album_artist,
        MusicTrack.year,
        func.count(MusicTrack.id).label("track_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
    ).filter(
        MusicTrack.album.isnot(None),
        MusicTrack.album != "",
    )
    if ignored:
        q = q.filter(func.lower(MusicTrack.artist).notin_(ignored))
    q = q.group_by(MusicTrack.album, MusicTrack.album_artist)

    if search and search.strip():
        q = q.filter(MusicTrack.album.ilike(f"%{search.strip()}%"))

    albums = q.order_by(MusicTrack.album).all()

    return [
        {
            "album": row.album,
            "album_artist": row.album_artist,
            "year": row.year,
            "track_count": row.track_count,
            "cover_path": _normalize_cover(row.cover_path, sf),
        }
        for row in albums
    ]


# ── Artists ────────────────────────────────────────────────────────

@router.get("/artists")
def list_artists(
    request: Request,
    search: str | None = Query(None, alias="q"),
    db: Session = Depends(_get_db),
):
    """List unique artists with track and album counts."""
    ignored = _ignored_artist_set(request)

    q = db.query(
        MusicTrack.artist,
        func.count(MusicTrack.id).label("track_count"),
        func.count(func.distinct(MusicTrack.album)).label("album_count"),
    ).filter(
        MusicTrack.artist.isnot(None),
        MusicTrack.artist != "",
    )
    if ignored:
        q = q.filter(func.lower(MusicTrack.artist).notin_(ignored))
    q = q.group_by(MusicTrack.artist)

    if search and search.strip():
        q = q.filter(MusicTrack.artist.ilike(f"%{search.strip()}%"))

    artists = q.order_by(MusicTrack.artist).all()

    return [
        {
            "artist": row.artist,
            "track_count": row.track_count,
            "album_count": row.album_count,
        }
        for row in artists
    ]


# ── Streaming ──────────────────────────────────────────────────────

@router.get("/stream/{file_id}")
async def stream_audio(request: Request, file_id: int):
    """Stream an audio file. file_id can be a MusicFile.id or MusicTrack.id (track_id)."""
    from .library_models import MusicFile
    from .streamer import get_audio_streamer
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        mf = db.query(MusicFile).filter_by(id=file_id).first()
        if not mf:
            mf = db.query(MusicFile).filter_by(track_id=file_id).first()
        if not mf:
            raise HTTPException(status_code=404, detail="File not found")
        file_path = mf.file_path
    finally:
        db.close()

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    range_header = request.headers.get("range")
    streamer = get_audio_streamer(file_path)
    return streamer.stream(file_path, range_header)


# ── Playlists ──────────────────────────────────────────────────────

@router.get("/playlists")
@expose()
def list_playlists(request: Request, db: Session = Depends(_get_db)):
    """List all playlists."""
    q = db.query(MusicPlaylist)
    if request.headers.get("X-Public-Only"):
        q = q.filter(MusicPlaylist.is_public == True)  # noqa: E712
    playlists = q.order_by(MusicPlaylist.created_at).all()
    return [p.to_json() for p in playlists]


@router.get("/playlists/{playlist_id}")
@expose(playlist_id=select(MusicPlaylist.id))
def get_playlist(request: Request, playlist_id: int, db: Session = Depends(_get_db)):
    """Get a specific playlist with all its tracks."""
    playlist = db.query(MusicPlaylist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if request.headers.get("X-Public-Only") and not playlist.is_public:
        raise HTTPException(status_code=404, detail="Playlist not found")
    local_ids = _get_local_file_track_ids(request.app.state.private_engine)
    result = playlist.to_json(include_items=True)
    for item in result.get("items", []):
        track = item.get("track", {})
        track["has_local_file"] = track.get("id") in local_ids
    return result


@router.patch("/playlists/{playlist_id}")
async def update_playlist(request: Request, playlist_id: int, db: Session = Depends(_get_db)):
    """Update playlist attributes (e.g. toggle is_public)."""
    playlist = db.query(MusicPlaylist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    data = await request.json()
    if "is_public" in data:
        playlist.is_public = bool(data["is_public"])
    db.commit()
    db.refresh(playlist)
    return playlist.to_json()


@router.post("/playlists")
async def create_playlist(request: Request, db: Session = Depends(_get_db)):
    """Create a new playlist."""
    data = await request.json()
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="name is required")

    playlist = MusicPlaylist(name=data["name"])
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return playlist.to_json()


@router.post("/playlists/{playlist_id}/items")
async def add_playlist_item(request: Request, playlist_id: int, db: Session = Depends(_get_db)):
    """Add a track to a playlist."""
    playlist = db.query(MusicPlaylist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    data = await request.json()
    track_id = data.get("track_id")
    if not track_id:
        raise HTTPException(status_code=400, detail="track_id is required")

    track = db.query(MusicTrack).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    max_pos = db.query(func.max(MusicPlaylistItem.position)).filter_by(playlist_id=playlist_id).scalar() or 0
    item = MusicPlaylistItem(
        playlist_id=playlist_id,
        track_id=track_id,
        position=max_pos + 1,
    )
    db.add(item)
    db.commit()
    db.refresh(playlist)
    return playlist.to_json(include_items=True)


@router.delete("/playlists/{playlist_id}/items/{item_id}")
def remove_playlist_item(request: Request, playlist_id: int, item_id: int, db: Session = Depends(_get_db)):
    """Remove a track from a playlist."""
    item = db.query(MusicPlaylistItem).filter_by(id=item_id, playlist_id=playlist_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"message": "Removed"}


@router.delete("/playlists/{playlist_id}")
def delete_playlist(request: Request, playlist_id: int, db: Session = Depends(_get_db)):
    """Delete a playlist."""
    playlist = db.query(MusicPlaylist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    db.delete(playlist)
    db.commit()
    return {"message": "Deleted"}


# ── Discover (find new music) ─────────────────────────────────────

@router.get("/discover")
def music_discover(request: Request, db: Session = Depends(_get_db)):
    """Help the user discover new music based on their taste profile.

    Strategy:
    1. Identify the user's taste (top genres, most-played artists)
    2. Find similar artists they don't have (via MusicBrainz relationships)
    3. Find albums they're missing from artists they already like
    4. Prioritize results by relevance to what they actually play
    """
    import random

    mb_client = _get_mb(request)
    ignored = _ignored_artist_set(request)

    # ── Build taste profile ───────────────────────────────────────
    # Prefer most-played artists, fall back to artists with most tracks
    taste_base = db.query(MusicTrack).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != "",
    )
    if ignored:
        taste_base = taste_base.filter(func.lower(MusicTrack.artist).notin_(ignored))

    top_played = taste_base.with_entities(
        MusicTrack.artist,
        func.sum(MusicTrack.play_count).label("plays"),
    ).filter(
        MusicTrack.play_count > 0,
    ).group_by(MusicTrack.artist).order_by(desc("plays")).limit(20).all()

    if top_played:
        taste_artists = [r.artist for r in top_played]
    else:
        taste_artists = [
            r[0] for r in taste_base.with_entities(
                MusicTrack.artist, func.count(MusicTrack.id).label("c")
            ).group_by(MusicTrack.artist).order_by(desc("c")).limit(20).all()
        ]

    library_artist_set = set(
        r[0].lower() for r in db.query(func.distinct(MusicTrack.artist)).filter(
            MusicTrack.artist.isnot(None), MusicTrack.artist != ""
        ).all()
    )
    library_albums = set(
        r[0].lower() for r in db.query(MusicTrack.album).filter(
            MusicTrack.album.isnot(None), MusicTrack.album != ""
        ).distinct().all()
    )

    # User's top genres
    top_genres = db.query(
        MusicTrack.genre,
        func.count(MusicTrack.id).label("count"),
    ).filter(
        MusicTrack.genre.isnot(None), MusicTrack.genre != ""
    ).group_by(MusicTrack.genre).order_by(desc("count")).limit(10).all()
    user_genres = [g.genre for g in top_genres]

    # ── Find new artists to explore ──────────────────────────────
    # Pick a subset of taste artists to query MusicBrainz
    seed_artists = taste_artists[:6] if len(taste_artists) <= 6 else random.sample(taste_artists[:12], 6)

    recommendations: list[dict] = []
    seen: set[str] = set()

    for artist_name in seed_artists:
        search_result = mb_client.search_artist(artist_name)
        if not search_result:
            continue
        artists_list = search_result.get("artists", [])
        if not artists_list:
            continue

        best = artists_list[0]
        mbid = best.get("id")
        if not mbid:
            continue

        artist_data = mb_client.get_artist(mbid)
        if not artist_data:
            continue

        # Get this artist's genres for matching
        artist_genres = [g.get("name", "") for g in artist_data.get("genres", [])]
        artist_tags = [t.get("name", "") for t in artist_data.get("tags", []) if t.get("count", 0) >= 1]

        # Find related artists not in library
        for rel in artist_data.get("relations", []):
            target = rel.get("artist")
            if not isinstance(target, dict):
                continue
            target_name = target.get("name", "")
            target_id = target.get("id", "")
            if not target_name or target_name.lower() in library_artist_set:
                continue
            if target_name.lower() in seen:
                continue

            seen.add(target_name.lower())
            rel_type = rel.get("type", "")
            reason = f"Related to {artist_name}"
            if rel_type == "member of band":
                reason = f"Member of {artist_name}" if rel.get("direction") == "backward" else f"{artist_name} is a member"
            elif rel_type in ("collaboration", "instrumental supporting musician", "vocal supporting musician"):
                reason = f"Collaborated with {artist_name}"

            recommendations.append({
                "name": target_name,
                "mbid": target_id,
                "reason": reason,
                "source_artist": artist_name,
                "genres": artist_genres[:4],
                "tags": artist_tags[:4],
            })

        if len(recommendations) >= 25:
            break

    # Sort: prioritize recommendations whose genres overlap with user's taste
    user_genre_set = set(g.lower() for g in user_genres)
    for rec in recommendations:
        overlap = sum(1 for g in rec["genres"] if g.lower() in user_genre_set)
        rec["_score"] = overlap
    recommendations.sort(key=lambda r: r["_score"], reverse=True)
    for rec in recommendations:
        rec.pop("_score", None)

    # ── Albums you're missing ─────────────────────────────────────
    # From your most-played artists, find releases you don't have
    missing_albums: list[dict] = []
    for artist_name in taste_artists[:5]:
        search_result = mb_client.search_artist(artist_name)
        if not search_result:
            continue
        artists_list = search_result.get("artists", [])
        if not artists_list:
            continue
        mbid = artists_list[0].get("id")
        if not mbid:
            continue

        rg_data = mb_client.browse_release_groups(mbid, limit=25)
        if not rg_data:
            continue

        for rg in rg_data.get("release-groups", []):
            title = rg.get("title", "")
            if not title or title.lower() in library_albums:
                continue
            rg_type = rg.get("primary-type", "Album")
            missing_albums.append({
                "title": title,
                "artist": artist_name,
                "type": rg_type,
                "mbid": rg.get("id", ""),
                "year": (rg.get("first-release-date") or "")[:4],
            })

        if len(missing_albums) >= 15:
            break

    missing_albums = missing_albums[:15]

    return {
        "recommendations": recommendations[:20],
        "missing_albums": missing_albums,
        "taste_profile": {
            "top_genres": user_genres,
            "seed_artists": seed_artists,
        },
    }


# ── Schedule (concerts & releases) ───────────────────────────────

@router.get("/schedule")
def music_schedule(
    request: Request,
    event_type: str | None = Query(None),
    db: Session = Depends(_get_db),
):
    """List upcoming music events (concerts, releases, tours)."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    q = db.query(MusicEvent).filter(MusicEvent.date >= now)
    if event_type:
        q = q.filter(MusicEvent.event_type == event_type)

    events = q.order_by(MusicEvent.date).all()

    # Also get past events (last 30 days)
    from datetime import timedelta
    past_q = db.query(MusicEvent).filter(
        MusicEvent.date < now,
        MusicEvent.date >= now - timedelta(days=30),
    )
    if event_type:
        past_q = past_q.filter(MusicEvent.event_type == event_type)
    past_events = past_q.order_by(desc(MusicEvent.date)).all()

    return {
        "upcoming": [e.to_json() for e in events],
        "past": [e.to_json() for e in past_events],
    }


@router.post("/schedule")
async def create_event(request: Request, db: Session = Depends(_get_db)):
    """Create a new music event."""
    from datetime import datetime
    data = await request.json()

    if not data.get("title") or not data.get("date"):
        raise HTTPException(status_code=400, detail="title and date are required")

    event = MusicEvent(
        event_type=data.get("event_type", "concert"),
        title=data["title"],
        artist=data.get("artist"),
        venue=data.get("venue"),
        city=data.get("city"),
        date=datetime.fromisoformat(data["date"].replace("Z", "+00:00")),
        end_date=datetime.fromisoformat(data["end_date"].replace("Z", "+00:00")) if data.get("end_date") else None,
        url=data.get("url"),
        notes=data.get("notes"),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event.to_json()


@router.put("/schedule/{event_id}")
async def update_event(request: Request, event_id: int, db: Session = Depends(_get_db)):
    """Update a music event."""
    from datetime import datetime
    event = db.query(MusicEvent).filter_by(id=event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    data = await request.json()
    for field in ("event_type", "title", "artist", "venue", "city", "url", "notes"):
        if field in data:
            setattr(event, field, data[field])
    if "date" in data:
        event.date = datetime.fromisoformat(data["date"].replace("Z", "+00:00"))
    if "end_date" in data:
        event.end_date = datetime.fromisoformat(data["end_date"].replace("Z", "+00:00")) if data["end_date"] else None

    db.commit()
    return event.to_json()


@router.delete("/schedule/{event_id}")
def delete_event(request: Request, event_id: int, db: Session = Depends(_get_db)):
    """Delete a music event."""
    event = db.query(MusicEvent).filter_by(id=event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.delete(event)
    db.commit()
    return {"message": "Deleted"}


# ── Cover art backfill ─────────────────────────────────────────

@router.get("/backfill-covers/status")
def backfill_covers_status(request: Request, db: Session = Depends(_get_db)):
    """Return count of tracks missing cover art."""
    from sqlalchemy import or_

    total = db.query(func.count(MusicTrack.id)).scalar() or 0
    missing = db.query(func.count(MusicTrack.id)).filter(
        or_(MusicTrack.cover_path.is_(None), MusicTrack.cover_path == "")
    ).scalar() or 0

    return {
        "total_tracks": total,
        "missing_covers": missing,
        "has_covers": total - missing,
    }


@router.post("/backfill-covers")
async def backfill_covers(request: Request):
    """Backfill cover art for tracks missing covers using MusicBrainz.

    Groups tracks by (artist, album) and searches once per album for efficiency.
    Streams SSE progress events.
    """
    import json as _json
    import queue
    import threading
    from collections import defaultdict
    from starlette.responses import StreamingResponse
    from sqlalchemy import or_

    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass

    limit = body.get("limit", 100)
    artist_filter = body.get("artist")
    clear_failed = body.get("clear_failed", False)
    rerun = body.get("rerun", False)
    static_folder = request.app.state.static_folder
    SL = request.app.state.SessionLocal
    q: queue.Queue = queue.Queue()

    if clear_failed or rerun:
        _clear_failed_cover_cache(request)

    def _worker():
        from ..task_registry import registry

        registry.register("cover_backfill", "Cover Art Backfill", status="running")
        db = SL()
        try:
            mb_client = _get_mb(request)

            base_q = db.query(MusicTrack)
            if not rerun:
                base_q = base_q.filter(
                    or_(MusicTrack.cover_path.is_(None), MusicTrack.cover_path == "")
                )
            if artist_filter:
                base_q = base_q.filter(MusicTrack.artist.ilike(f"%{artist_filter}%"))

            tracks = base_q.order_by(MusicTrack.artist, MusicTrack.album).all()

            album_groups: dict[tuple[str, str], list] = defaultdict(list)
            for t in tracks:
                key = (t.artist or "", t.album or "")
                album_groups[key].append(t)

            groups_list = list(album_groups.items())
            total_groups = len(groups_list)
            total_tracks_to_process = len(tracks)

            if limit:
                applied = 0
                capped_groups = []
                for key, group_tracks in groups_list:
                    if applied >= limit:
                        break
                    capped_groups.append((key, group_tracks))
                    applied += len(group_tracks)
                groups_list = capped_groups
                total_groups = len(groups_list)
                total_tracks_to_process = sum(len(g) for _, g in groups_list)

            stats = {
                "total_groups": total_groups,
                "total_tracks": total_tracks_to_process,
                "groups_processed": 0,
                "tracks_updated": 0,
                "covers_found": 0,
                "covers_not_found": 0,
                "errors": 0,
                "current_artist": "",
                "current_album": "",
            }
            q.put({"progress": stats.copy()})

            for idx, ((artist, album), group_tracks) in enumerate(groups_list):
                stats["current_artist"] = artist
                stats["current_album"] = album
                stats["groups_processed"] = idx

                registry.update(
                    "cover_backfill",
                    detail=f"{stats['covers_found']} covers found ({idx}/{total_groups} groups)",
                )

                try:
                    cover_path = _backfill_album_cover(
                        mb_client, artist, album, group_tracks, static_folder
                    )
                    if cover_path:
                        for t in group_tracks:
                            t.cover_path = cover_path
                        stats["covers_found"] += 1
                        stats["tracks_updated"] += len(group_tracks)
                    else:
                        stats["covers_not_found"] += 1

                    if (idx + 1) % 5 == 0:
                        db.commit()

                except Exception as exc:
                    log.warning("Cover backfill error for %s - %s: %s", artist, album, exc)
                    stats["errors"] += 1

                q.put({"progress": stats.copy()})

            stats["groups_processed"] = total_groups
            db.commit()

            q.put({"done": True, **stats})
            registry.update(
                "cover_backfill", status="idle",
                detail=f"{stats['covers_found']} covers found, {stats['tracks_updated']} tracks updated",
            )
        except Exception as exc:
            log.error("Cover backfill failed: %s", exc, exc_info=True)
            db.rollback()
            q.put({"error": str(exc)})
            registry.update("cover_backfill", status="error", error=str(exc))
        finally:
            db.close()
            registry.unregister("cover_backfill")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    def _stream():
        while True:
            try:
                evt = q.get(timeout=600)
            except queue.Empty:
                yield f"data: {_json.dumps({'error': 'Backfill timed out'})}\n\n"
                return
            yield f"data: {_json.dumps(evt)}\n\n"
            if "done" in evt or "error" in evt:
                return

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _backfill_album_cover(
    mb_client, artist: str, album: str, tracks: list, static_folder: str,
) -> str | None:
    """Try to find cover art for an album group.

    Strategy (in priority order):
    1. Direct release search by album + artist (most reliable when we have both)
    2. Direct release search by album alone (if artist search yielded nothing)
    3. Fall back to recording search using first track title
    """
    best_release_mbid = _find_release_via_album_search(mb_client, artist, album)

    if not best_release_mbid:
        representative = tracks[0]
        title = representative.title
        if title:
            best_release_mbid = _find_release_via_recording_search(
                mb_client, title, artist, album
            )

    if not best_release_mbid:
        return None

    cover_path = mb_client.get_cover_art(best_release_mbid)
    if not cover_path:
        return None

    sf = static_folder.rstrip("/") + "/"
    if cover_path.startswith(sf):
        cover_path = cover_path[len(sf):]

    return cover_path


def _find_release_via_album_search(
    mb_client, artist: str, album: str,
) -> str | None:
    """Search MusicBrainz releases directly by album name + artist."""
    if not album:
        return None

    result = mb_client.search_release(album, artist or None)
    if not result or not result.get("releases"):
        return None

    for release in result["releases"]:
        score = release.get("score", 0)
        if score < 60:
            continue
        release_title = release.get("title", "").lower()
        if release_title == album.lower():
            return release.get("id")

    # No exact title match — accept the top result if score is high enough
    top = result["releases"][0]
    if top.get("score", 0) >= 80:
        return top.get("id")

    return None


def _find_release_via_recording_search(
    mb_client, title: str, artist: str | None, album: str | None,
) -> str | None:
    """Fallback: search for a recording by track title, extract release MBID."""
    result = mb_client.search_recording(title, artist or None)
    if not result or not result.get("recordings"):
        return None

    best_release_mbid = None
    exact_match = False
    for rec in result.get("recordings", []):
        score = rec.get("score", 0)
        if score < 70:
            continue
        for release in rec.get("releases", []):
            release_title = release.get("title", "").lower()
            if album and release_title == album.lower():
                best_release_mbid = release.get("id")
                exact_match = True
                break
            if not best_release_mbid:
                best_release_mbid = release.get("id")
        if exact_match:
            break

    return best_release_mbid


# ── Spotify import ────────────────────────────────────────────

@router.post("/import/spotify")
async def import_spotify(request: Request):
    """Import Spotify Extended Streaming History from extracted JSON files.

    Runs in a background thread and streams SSE progress events.
    """
    import json as _json
    import queue
    import threading
    from starlette.responses import StreamingResponse

    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass

    static_folder = request.app.state.static_folder
    dump_dir = body.get("dump_dir") or os.path.join(static_folder, "dumps", "spotify")

    if not Path(dump_dir).is_dir():
        raise HTTPException(status_code=404, detail=f"Dump directory not found: {dump_dir}")

    SL = request.app.state.SessionLocal
    q: queue.Queue = queue.Queue()

    def _worker():
        from .spotify_importer import import_spotify_data
        from ..task_registry import registry

        registry.register("spotify_import", "Spotify Import", status="running")
        db = SL()
        try:
            def _on_progress(stats):
                registry.update(
                    "spotify_import",
                    detail=f"{stats['total_processed']} events processed",
                    progress=None,
                )
                q.put({"progress": stats.copy()})

            result = import_spotify_data(
                db, dump_dir,
                static_folder=static_folder,
                on_progress=_on_progress,
            )
            q.put({"done": True, **result})
            registry.update("spotify_import", status="idle", detail=f"{result['music_plays_imported']} plays imported")
        except Exception as exc:
            log.error("Spotify import failed: %s", exc, exc_info=True)
            db.rollback()
            q.put({"error": str(exc)})
            registry.update("spotify_import", status="error", error=str(exc))
        finally:
            db.close()
            registry.unregister("spotify_import")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    def _stream():
        while True:
            try:
                evt = q.get(timeout=300)
            except queue.Empty:
                yield f"data: {_json.dumps({'error': 'Import timed out'})}\n\n"
                return
            yield f"data: {_json.dumps(evt)}\n\n"
            if "done" in evt or "error" in evt:
                return

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Spotify playlist / library import ─────────────────────────────

@router.post("/import/spotify-library")
async def import_spotify_library(request: Request):
    """Import playlists and liked songs from Spotify Account Data.

    Looks for Playlist1.json and YourLibrary.json in the dump directory.
    """
    import json as _json
    import queue
    import threading
    from starlette.responses import StreamingResponse

    body: dict = {}
    try:
        body = await request.json()
    except Exception:
        pass

    static_folder = request.app.state.static_folder
    dump_dir = body.get("dump_dir") or os.path.join(static_folder, "dumps", "spotify")

    if not Path(dump_dir).is_dir():
        raise HTTPException(status_code=404, detail=f"Dump directory not found: {dump_dir}")

    SL = request.app.state.SessionLocal
    q: queue.Queue = queue.Queue()

    def _worker():
        from .spotify_importer import import_spotify_playlists
        from ..task_registry import registry

        registry.register("spotify_library_import", "Spotify Library Import", status="running")
        db = SL()
        try:
            def _on_progress(stats):
                registry.update(
                    "spotify_library_import",
                    detail=f"{stats['playlists_created']} playlists, {stats['playlist_items_added']} items",
                )
                q.put({"progress": stats.copy()})

            result = import_spotify_playlists(db, dump_dir, on_progress=_on_progress)
            q.put({"done": True, **result})
            registry.update(
                "spotify_library_import", status="idle",
                detail=f"{result['playlists_created']} playlists, {result['liked_tracks_imported']} liked",
            )
        except Exception as exc:
            log.error("Spotify library import failed: %s", exc, exc_info=True)
            db.rollback()
            q.put({"error": str(exc)})
            registry.update("spotify_library_import", status="error", error=str(exc))
        finally:
            db.close()
            registry.unregister("spotify_library_import")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    def _stream():
        while True:
            try:
                evt = q.get(timeout=300)
            except queue.Empty:
                yield f"data: {_json.dumps({'error': 'Import timed out'})}\n\n"
                return
            yield f"data: {_json.dumps(evt)}\n\n"
            if "done" in evt or "error" in evt:
                return

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Listening history stats & migration ──────────────────────────────

@router.get("/import/history-stats")
def listening_history_stats(request: Request):
    """Per-year listening history database sizes and row counts."""
    from .listening_db import get_history_stats
    from sqlalchemy import inspect as sa_inspect, text

    static_folder = request.app.state.static_folder
    years = get_history_stats(static_folder)

    engine = request.app.state.SessionLocal().get_bind()
    insp = sa_inspect(engine)
    needs_migration = (
        insp.has_table("music_listening_history")
        or insp.has_table("podcast_listening_history")
    )

    main_music_count = 0
    main_podcast_count = 0
    if insp.has_table("music_listening_history"):
        with engine.connect() as conn:
            main_music_count = conn.execute(
                text("SELECT COUNT(*) FROM music_listening_history")
            ).scalar() or 0
    if insp.has_table("podcast_listening_history"):
        with engine.connect() as conn:
            main_podcast_count = conn.execute(
                text("SELECT COUNT(*) FROM podcast_listening_history")
            ).scalar() or 0

    return {
        "years": years,
        "needs_migration": needs_migration,
        "main_db_music_rows": main_music_count,
        "main_db_podcast_rows": main_podcast_count,
    }


@router.post("/import/migrate-history")
async def migrate_listening_history(request: Request):
    """Migrate listening history from main DB to per-year databases."""
    import json as _json
    import queue
    import threading
    from starlette.responses import StreamingResponse

    SL = request.app.state.SessionLocal
    static_folder = request.app.state.static_folder
    q: queue.Queue = queue.Queue()

    def _worker():
        from .migrate_listening_history import migrate
        from ..task_registry import registry

        registry.register("history_migration", "History Migration", status="running")
        try:
            def _on_progress(stats):
                registry.update(
                    "history_migration",
                    detail=f"{stats['phase']}: {stats['music_rows_migrated']}m + {stats['podcast_rows_migrated']}p rows",
                )
                q.put({"progress": stats.copy()})

            result = migrate(SL, static_folder, on_progress=_on_progress)
            q.put({"done": True, **result})
            registry.update(
                "history_migration", status="idle",
                detail=f"Migrated {result['music_rows_migrated']} + {result['podcast_rows_migrated']} rows",
            )
        except Exception as exc:
            log.error("History migration failed: %s", exc, exc_info=True)
            q.put({"error": str(exc)})
            registry.update("history_migration", status="error", error=str(exc))
        finally:
            registry.unregister("history_migration")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()

    def _stream():
        while True:
            try:
                evt = q.get(timeout=600)
            except queue.Empty:
                yield f"data: {_json.dumps({'error': 'Migration timed out'})}\n\n"
                return
            yield f"data: {_json.dumps(evt)}\n\n"
            if "done" in evt or "error" in evt:
                return

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
