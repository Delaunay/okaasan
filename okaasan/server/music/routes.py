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
        base = Path(request.app.state.static_folder)
        cache_dir = base / "uploads" / "data" / "music" / "mb_cache"
        covers_dir = base / "uploads" / "data" / "music" / "covers"
        _mb_client = MusicBrainzClient(cache_dir, covers_dir)
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

def _track_to_frontend(t) -> dict:
    """Convert a MusicTrack ORM object to the frontend MusicTrack shape."""
    d = t.to_json()
    d["duration"] = (d.pop("duration_ms", 0) or 0) / 1000.0
    d["album_id"] = None
    return d


@router.get("/overview")
def music_overview(request: Request, db: Session = Depends(_get_db)):
    """Aggregated overview: stats + recently added tracks."""
    total_tracks = db.query(func.count(MusicTrack.id)).scalar() or 0
    total_albums = db.query(func.count(func.distinct(MusicTrack.album))).filter(
        MusicTrack.album.isnot(None), MusicTrack.album != ""
    ).scalar() or 0
    total_artists = db.query(func.count(func.distinct(MusicTrack.artist))).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != ""
    ).scalar() or 0
    total_playlists = db.query(func.count(MusicPlaylist.id)).scalar() or 0

    recent = (
        db.query(MusicTrack)
        .order_by(desc(MusicTrack.created_at))
        .limit(20)
        .all()
    )

    return {
        "stats": {
            "total_tracks": total_tracks,
            "total_albums": total_albums,
            "total_artists": total_artists,
            "total_playlists": total_playlists,
        },
        "recent_tracks": [_track_to_frontend(t) for t in recent],
    }


@router.get("/library")
def music_library(request: Request, db: Session = Depends(_get_db)):
    """Full library data: albums, artists, and tracks for the library page."""
    albums_q = db.query(
        MusicTrack.album,
        MusicTrack.album_artist,
        MusicTrack.year,
        func.count(MusicTrack.id).label("track_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
        func.min(MusicTrack.id).label("id"),
    ).filter(
        MusicTrack.album.isnot(None), MusicTrack.album != ""
    ).group_by(MusicTrack.album, MusicTrack.album_artist).order_by(MusicTrack.album).all()

    albums = [
        {
            "id": row.id,
            "name": row.album or "",
            "artist": row.album_artist or "",
            "year": row.year,
            "cover_path": row.cover_path,
            "track_count": row.track_count,
        }
        for row in albums_q
    ]

    artists_q = db.query(
        MusicTrack.artist,
        func.count(MusicTrack.id).label("track_count"),
        func.count(func.distinct(MusicTrack.album)).label("album_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
        func.min(MusicTrack.id).label("id"),
    ).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != ""
    ).group_by(MusicTrack.artist).order_by(MusicTrack.artist).all()

    artists = [
        {
            "id": row.id,
            "name": row.artist or "",
            "album_count": row.album_count,
            "track_count": row.track_count,
            "cover_path": row.cover_path,
        }
        for row in artists_q
    ]

    tracks = (
        db.query(MusicTrack)
        .order_by(MusicTrack.artist, MusicTrack.album, MusicTrack.track_number)
        .all()
    )

    return {
        "albums": albums,
        "artists": artists,
        "tracks": [_track_to_frontend(t) for t in tracks],
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
        "items": [t.to_json() for t in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


@router.get("/tracks/{track_id}")
def get_track(request: Request, track_id: int, db: Session = Depends(_get_db)):
    """Get a single track by ID."""
    track = db.query(MusicTrack).filter_by(id=track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track.to_json()


# ── Albums ─────────────────────────────────────────────────────────

@router.get("/albums")
def list_albums(
    request: Request,
    search: str | None = Query(None, alias="q"),
    db: Session = Depends(_get_db),
):
    """List unique albums with track counts."""
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
            "cover_path": row.cover_path,
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
    """Stream an audio file (direct or transcoded)."""
    from .library_models import MusicFile
    from .streamer import get_audio_streamer
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        mf = db.query(MusicFile).filter_by(id=file_id).first()
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


@router.delete("/playlists/{playlist_id}")
def delete_playlist(request: Request, playlist_id: int, db: Session = Depends(_get_db)):
    """Delete a playlist."""
    playlist = db.query(MusicPlaylist).filter_by(id=playlist_id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    db.delete(playlist)
    db.commit()
    return {"message": "Deleted"}


# ── Discover ──────────────────────────────────────────────────────

@router.get("/discover")
def music_discover(request: Request, db: Session = Depends(_get_db)):
    """Discovery page: genres, random picks, top artists, new additions."""
    import random

    # Genre breakdown
    genres_q = db.query(
        MusicTrack.genre,
        func.count(MusicTrack.id).label("count"),
    ).filter(
        MusicTrack.genre.isnot(None), MusicTrack.genre != ""
    ).group_by(MusicTrack.genre).order_by(desc("count")).limit(20).all()

    genres = [{"name": g.genre, "count": g.count} for g in genres_q]

    # Top artists by track count
    top_artists_q = db.query(
        MusicTrack.artist,
        func.count(MusicTrack.id).label("track_count"),
        func.count(func.distinct(MusicTrack.album)).label("album_count"),
        func.min(MusicTrack.cover_path).label("cover_path"),
    ).filter(
        MusicTrack.artist.isnot(None), MusicTrack.artist != ""
    ).group_by(MusicTrack.artist).order_by(desc("track_count")).limit(12).all()

    top_artists = [
        {"name": a.artist, "track_count": a.track_count, "album_count": a.album_count, "cover_path": a.cover_path}
        for a in top_artists_q
    ]

    # Random picks (up to 20 random tracks)
    total = db.query(func.count(MusicTrack.id)).scalar() or 0
    random_tracks = []
    if total > 0:
        all_ids = [r[0] for r in db.query(MusicTrack.id).all()]
        pick_ids = random.sample(all_ids, min(20, len(all_ids)))
        picks = db.query(MusicTrack).filter(MusicTrack.id.in_(pick_ids)).all()
        random_tracks = [_track_to_frontend(t) for t in picks]

    # Recently added albums
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
        {"name": a.album, "artist": a.album_artist or "", "year": a.year, "track_count": a.track_count, "cover_path": a.cover_path}
        for a in recent_albums_q
    ]

    return {
        "genres": genres,
        "top_artists": top_artists,
        "random_tracks": random_tracks,
        "recent_albums": recent_albums,
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
