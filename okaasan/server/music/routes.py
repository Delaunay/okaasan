"""API routes for Music section."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from .models import MusicTrack, MusicPlaylist, MusicPlaylistItem, MusicEvent
from .metadata import MusicBrainzClient
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

    save_config(request.app.state.static_folder, config)
    return {"message": "Configuration saved", "config": config}


@router.post("/library/scan")
async def library_scan(request: Request):
    """Trigger a manual music library scan. Pass {"force": true} to re-scan all files."""
    from .library import scan_folders
    from .library_models import MusicFile
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    data = {}
    try:
        data = await request.json()
    except Exception:
        pass

    static_folder = request.app.state.static_folder
    private_engine = request.app.state.private_engine

    if data.get("force"):
        PrivateSession = sessionmaker(bind=private_engine)
        pdb = PrivateSession()
        try:
            deleted = pdb.query(MusicFile).delete()
            pdb.commit()
            log.info("Force re-scan: cleared %d existing file entries", deleted)
        finally:
            pdb.close()

    db_path = os.path.join(static_folder, "database.db")
    main_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    result = scan_folders(static_folder, private_engine, main_engine)

    global _music_scanner
    if _music_scanner:
        from datetime import datetime, timezone
        _music_scanner.last_scan = datetime.now(timezone.utc)
        _music_scanner.last_result = result

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


def _track_to_frontend(t, static_folder: str = "") -> dict:
    """Convert a MusicTrack ORM object to the frontend MusicTrack shape."""
    d = t.to_json()
    d["duration"] = (d.pop("duration_ms", 0) or 0) / 1000.0
    d["album_id"] = None
    sf = static_folder or _static_folder_cache
    if sf:
        d["cover_path"] = _normalize_cover(d.get("cover_path"), sf)
    return d


@router.get("/overview")
def music_overview(request: Request, db: Session = Depends(_get_db)):
    """Aggregated overview: stats, genres, top artists, random picks, recent albums."""
    import random

    sf = request.app.state.static_folder
    total_tracks = db.query(func.count(MusicTrack.id)).scalar() or 0
    total_albums = db.query(func.count(func.distinct(MusicTrack.album))).filter(
        MusicTrack.album.isnot(None), MusicTrack.album != ""
    ).scalar() or 0
    total_artists = db.query(func.count(func.distinct(MusicTrack.artist))).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != ""
    ).scalar() or 0
    total_playlists = db.query(func.count(MusicPlaylist.id)).scalar() or 0

    # Genre breakdown
    genres_q = db.query(
        MusicTrack.genre,
        func.count(MusicTrack.id).label("count"),
    ).filter(
        MusicTrack.genre.isnot(None), MusicTrack.genre != ""
    ).group_by(MusicTrack.genre).order_by(desc("count")).limit(20).all()
    genres = [{"name": g.genre, "count": g.count} for g in genres_q]

    # Top artists
    top_artists_q = db.query(
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

    # Random picks
    random_tracks = []
    if total_tracks > 0:
        all_ids = [r[0] for r in db.query(MusicTrack.id).all()]
        pick_ids = random.sample(all_ids, min(20, len(all_ids)))
        picks = db.query(MusicTrack).filter(MusicTrack.id.in_(pick_ids)).all()
        random_tracks = [_track_to_frontend(t, sf) for t in picks]

    # Recent albums
    recent_albums_q = db.query(
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
    base_q = db.query(MusicTrack)
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
                "tracks": [_track_to_frontend(t, sf) for t in tracks],
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
                "tracks": [_track_to_frontend(t, sf) for t in tracks],
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
    q = db.query(MusicTrack)

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
        "items": [_track_to_frontend(t, sf) for t in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@router.get("/tracks/{track_id}")
def get_track(request: Request, track_id: int, db: Session = Depends(_get_db)):
    """Get a single track by ID."""
    sf = request.app.state.static_folder
    track = db.query(MusicTrack).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return _track_to_frontend(track, sf)


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
def music_stats(request: Request, db: Session = Depends(_get_db)):
    """Music listening statistics and metadata breakdown."""
    sf = request.app.state.static_folder

    total_tracks = db.query(func.count(MusicTrack.id)).scalar() or 0
    total_plays = db.query(func.sum(MusicTrack.play_count)).scalar() or 0
    total_duration_ms = db.query(func.sum(MusicTrack.duration_ms)).scalar() or 0
    total_listening_ms = db.query(
        func.sum(MusicTrack.duration_ms * MusicTrack.play_count)
    ).scalar() or 0

    # Most played tracks
    most_played = db.query(MusicTrack).filter(
        MusicTrack.play_count > 0
    ).order_by(desc(MusicTrack.play_count)).limit(20).all()

    # Most played artists
    top_artists_plays = db.query(
        MusicTrack.artist,
        func.sum(MusicTrack.play_count).label("total_plays"),
        func.count(MusicTrack.id).label("track_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
    ).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != "",
        MusicTrack.play_count > 0
    ).group_by(MusicTrack.artist).order_by(desc("total_plays")).limit(15).all()

    # Most played albums
    top_albums_plays = db.query(
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
    genre_dist = db.query(
        MusicTrack.genre,
        func.count(MusicTrack.id).label("track_count"),
        func.sum(MusicTrack.play_count).label("total_plays"),
        func.sum(MusicTrack.duration_ms).label("total_duration_ms"),
    ).filter(
        MusicTrack.genre.isnot(None), MusicTrack.genre != ""
    ).group_by(MusicTrack.genre).order_by(desc("track_count")).limit(20).all()

    # Year distribution
    year_dist = db.query(
        MusicTrack.year,
        func.count(MusicTrack.id).label("track_count"),
        func.sum(MusicTrack.play_count).label("total_plays"),
    ).filter(
        MusicTrack.year.isnot(None)
    ).group_by(MusicTrack.year).order_by(MusicTrack.year).all()

    # Recently played
    recently_played = db.query(MusicTrack).filter(
        MusicTrack.last_played_at.isnot(None)
    ).order_by(desc(MusicTrack.last_played_at)).limit(20).all()

    # Unplayed tracks count
    unplayed_count = db.query(func.count(MusicTrack.id)).filter(
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
        "most_played": [_track_to_frontend(t, sf) for t in most_played],
        "recently_played": [_track_to_frontend(t, sf) for t in recently_played],
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
    q = db.query(
        MusicTrack.album,
        MusicTrack.album_artist,
        MusicTrack.year,
        func.count(MusicTrack.id).label("track_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
    ).filter(
        MusicTrack.album.isnot(None),
        MusicTrack.album != "",
    ).group_by(MusicTrack.album, MusicTrack.album_artist)

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
    q = db.query(
        MusicTrack.artist,
        func.count(MusicTrack.id).label("track_count"),
        func.count(func.distinct(MusicTrack.album)).label("album_count"),
    ).filter(
        MusicTrack.artist.isnot(None),
        MusicTrack.artist != "",
    ).group_by(MusicTrack.artist)

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
def list_playlists(request: Request, db: Session = Depends(_get_db)):
    """List all playlists."""
    playlists = db.query(MusicPlaylist).order_by(MusicPlaylist.created_at).all()
    return [p.to_json() for p in playlists]


@router.get("/playlists/{playlist_id}")
def get_playlist(request: Request, playlist_id: int, db: Session = Depends(_get_db)):
    """Get a specific playlist with all its tracks."""
    playlist = db.query(MusicPlaylist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist.to_json(include_items=True)


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

    # ── Build taste profile ───────────────────────────────────────
    # Prefer most-played artists, fall back to artists with most tracks
    top_played = db.query(
        MusicTrack.artist,
        func.sum(MusicTrack.play_count).label("plays"),
    ).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != "",
        MusicTrack.play_count > 0,
    ).group_by(MusicTrack.artist).order_by(desc("plays")).limit(20).all()

    if top_played:
        taste_artists = [r.artist for r in top_played]
    else:
        taste_artists = [
            r[0] for r in db.query(MusicTrack.artist, func.count(MusicTrack.id).label("c")).filter(
                MusicTrack.artist.isnot(None), MusicTrack.artist != ""
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
