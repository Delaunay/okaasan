"""API routes for Retro Games (ROMs) section."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Game, GameSaveState
from .metadata import IGDBClient
from ..paths import private_folder, public_folder, cache_folder

log = logging.getLogger("okaasan.games")

router = APIRouter(prefix="/games", tags=["games"])

_igdb: IGDBClient | None = None
_library_scanner = None

PLATFORM_TO_CORE: dict[str, str] = {
    "nes": "fceumm",
    "snes": "snes9x",
    "gb": "gambatte",
    "gbc": "gambatte",
    "gba": "mgba",
    "n64": "mupen64plus_next",
    "genesis": "genesis_plus_gx",
    "sms": "genesis_plus_gx",
    "psx": "pcsx_rearmed",
    "psp": "ppsspp",
    "nds": "melonds",
    "arcade": "fbneo",
    "atari2600": "stella2014",
    "atari7800": "prosystem",
}


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


def _init_igdb(static_folder: str) -> IGDBClient:
    import json as _json
    global _igdb

    client_id = None
    client_secret = None
    config_path = private_folder() / "_games.json"
    if config_path.is_file():
        try:
            with open(config_path) as f:
                cfg = _json.load(f)
                client_id = cfg.get("client_id")
                client_secret = cfg.get("client_secret")
        except (ValueError, OSError):
            pass

    _igdb = IGDBClient(
        cache_folder() / "games" / "igdb",
        client_id=client_id,
        client_secret=client_secret,
        covers_dir=public_folder() / "data" / "games" / "covers",
    )
    return _igdb


def _get_igdb(request: Request) -> IGDBClient:
    global _igdb
    if _igdb is None:
        _init_igdb(request.app.state.static_folder)
    return _igdb


# ── Game List ──────────────────────────────────────────────────────

@router.get("/list")
def list_games(
    request: Request,
    platform: str | None = Query(None),
    db: Session = Depends(_get_db),
):
    """All games, optionally filtered by platform."""
    q = db.query(Game)
    if platform:
        q = q.filter(Game.platform == platform)
    games = q.order_by(Game.title).all()
    return [g.to_json() for g in games]


@router.get("/platforms")
def list_platforms(request: Request, db: Session = Depends(_get_db)):
    """List all platforms with game counts."""
    rows = (
        db.query(Game.platform, func.count(Game.id))
        .filter(Game.platform.isnot(None))
        .group_by(Game.platform)
        .order_by(func.count(Game.id).desc())
        .all()
    )
    return {"platforms": [p for p, _ in rows], "counts": [{"platform": p, "count": c} for p, c in rows]}


@router.get("/search")
def search_igdb(
    request: Request,
    q: str = Query(..., min_length=1),
    platform: str | None = Query(None),
):
    """Search IGDB for games."""
    igdb = _get_igdb(request)
    if not igdb.available:
        raise HTTPException(status_code=503, detail="IGDB not configured. Add Twitch credentials in Settings.")
    results = igdb.search_game(q, platform)
    return {"results": results}


@router.get("/core/{platform}")
def get_emulatorjs_core(platform: str):
    """Return the correct EmulatorJS core name for a platform."""
    core = PLATFORM_TO_CORE.get(platform)
    if not core:
        raise HTTPException(status_code=404, detail=f"Unknown platform: {platform}")
    return {"platform": platform, "core": core}


@router.get("/{game_id:int}")
def get_game(request: Request, game_id: int, db: Session = Depends(_get_db)):
    """Get game detail."""
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game.to_json()


# ── IGDB Metadata ──────────────────────────────────────────────────

@router.get("/igdb/status")
def igdb_status(request: Request):
    """Check if IGDB credentials are configured."""
    igdb = _get_igdb(request)
    return {
        "configured": igdb.available,
        "has_cached_data": bool(list(igdb.meta_cache_dir.glob("*/*.json"))) if igdb.meta_cache_dir.exists() else False,
    }


@router.post("/igdb/configure")
async def configure_igdb(request: Request):
    """Save Twitch/IGDB credentials to private config."""
    import json
    data = await request.json()
    client_id = data.get("client_id", "").strip()
    client_secret = data.get("client_secret", "").strip()

    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="client_id and client_secret are required")

    config_path = private_folder() / "_games.json"

    existing = {}
    if config_path.is_file():
        try:
            with open(config_path) as f:
                existing = json.load(f)
        except (ValueError, OSError):
            pass

    existing["client_id"] = client_id
    existing["client_secret"] = client_secret

    with open(config_path, "w") as f:
        json.dump(existing, f)

    global _igdb
    _igdb = IGDBClient(
        cache_folder() / "games" / "igdb",
        client_id=client_id,
        client_secret=client_secret,
        covers_dir=public_folder() / "data" / "games" / "covers",
    )

    return {"configured": True}


# ── ROM Library ────────────────────────────────────────────────────

@router.get("/library/status")
def library_status(request: Request):
    """Get library scan status and stats."""
    from .library import load_config
    from .library_models import RomFile
    from sqlalchemy.orm import sessionmaker

    config = load_config(request.app.state.static_folder)
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        total = db.query(RomFile).count()
        matched = db.query(RomFile).filter_by(matched=True).count()
    finally:
        db.close()

    global _library_scanner
    last_scan = _library_scanner.last_scan.isoformat() + "Z" if _library_scanner and _library_scanner.last_scan else None

    return {
        "configured": bool(config.get("folders")),
        "folders": config.get("folders", []),
        "total_files": total,
        "matched_files": matched,
        "unmatched_files": total - matched,
        "last_scan": last_scan,
        "scan_interval_minutes": config.get("scan_interval_minutes", 60),
    }


@router.post("/library/configure")
async def library_configure(request: Request):
    """Save library folder configuration."""
    from .library import save_config, load_config
    data = await request.json()

    config = load_config(request.app.state.static_folder)
    if "folders" in data:
        config["folders"] = data["folders"]
    if "scan_interval_minutes" in data:
        config["scan_interval_minutes"] = data["scan_interval_minutes"]

    save_config(request.app.state.static_folder, config)
    return {"message": "Configuration saved", "config": config}


@router.post("/library/scan")
async def library_scan(request: Request):
    """Trigger a manual library scan."""
    from .library import scan_folders
    from sqlalchemy import create_engine

    static_folder = request.app.state.static_folder
    private_engine = request.app.state.private_engine

    db_path = os.path.join(static_folder, "database.db")
    main_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})

    result = scan_folders(static_folder, private_engine, main_engine)

    global _library_scanner
    if _library_scanner:
        from datetime import datetime, timezone
        _library_scanner.last_scan = datetime.now(timezone.utc)
        _library_scanner.last_result = result

    return {"message": "Scan complete", **result}


@router.get("/library/all-files")
def library_all_files(request: Request):
    """Get all ROM files."""
    from .library_models import RomFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        files = pdb.query(RomFile).order_by(RomFile.platform, RomFile.title).all()
        return {"files": [f.to_json() for f in files]}
    finally:
        pdb.close()


# ── Play ROM ───────────────────────────────────────────────────────

@router.get("/play/{file_id}")
def play_rom(request: Request, file_id: int):
    """Serve a ROM file for EmulatorJS."""
    from .library_models import RomFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    db = PrivateSession()
    try:
        rf = db.query(RomFile).filter_by(id=file_id).first()
        if not rf:
            raise HTTPException(status_code=404, detail="ROM file not found")
        file_path = rf.file_path
        container = rf.container or ""
    finally:
        db.close()

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    media_types = {
        "nes": "application/octet-stream",
        "sfc": "application/octet-stream",
        "smc": "application/octet-stream",
        "gb": "application/octet-stream",
        "gbc": "application/octet-stream",
        "gba": "application/octet-stream",
        "n64": "application/octet-stream",
        "z64": "application/octet-stream",
        "v64": "application/octet-stream",
        "nds": "application/octet-stream",
        "zip": "application/zip",
        "iso": "application/octet-stream",
        "bin": "application/octet-stream",
        "cue": "text/plain",
    }

    return FileResponse(
        file_path,
        media_type=media_types.get(container, "application/octet-stream"),
        filename=os.path.basename(file_path),
    )


# ── Save States ────────────────────────────────────────────────────

@router.get("/{game_id}/save-states")
def list_save_states(request: Request, game_id: int, db: Session = Depends(_get_db)):
    """List all save states for a game."""
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    states = (
        db.query(GameSaveState)
        .filter_by(game_id=game_id)
        .order_by(GameSaveState.slot_number)
        .all()
    )
    return [s.to_json() for s in states]


@router.post("/{game_id}/save-state")
async def upload_save_state(
    request: Request,
    game_id: int,
    slot: int = Query(0),
    data_file: UploadFile = File(...),
    screenshot: UploadFile | None = File(None),
    db: Session = Depends(_get_db),
):
    """Upload save state data (and optional screenshot)."""
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    save_dir = public_folder() / "data" / "games" / "save_states" / str(game_id)
    save_dir.mkdir(parents=True, exist_ok=True)

    data_path = save_dir / f"slot_{slot}.sav"
    content = await data_file.read()
    data_path.write_bytes(content)

    screenshot_path_str: str | None = None
    if screenshot:
        ss_path = save_dir / f"slot_{slot}_screenshot.png"
        ss_content = await screenshot.read()
        ss_path.write_bytes(ss_content)
        screenshot_path_str = str(ss_path)

    existing = db.query(GameSaveState).filter_by(game_id=game_id, slot_number=slot).first()
    if existing:
        existing.data_path = str(data_path)
        if screenshot_path_str:
            existing.screenshot_path = screenshot_path_str
    else:
        ss = GameSaveState(
            game_id=game_id,
            slot_number=slot,
            data_path=str(data_path),
            screenshot_path=screenshot_path_str,
        )
        db.add(ss)

    db.commit()
    return {"message": "Save state uploaded", "slot": slot}


@router.get("/{game_id}/save-state/{slot}")
def download_save_state(request: Request, game_id: int, slot: int, db: Session = Depends(_get_db)):
    """Download a save state file."""
    ss = db.query(GameSaveState).filter_by(game_id=game_id, slot_number=slot).first()
    if not ss:
        raise HTTPException(status_code=404, detail="Save state not found")

    if not os.path.isfile(ss.data_path):
        raise HTTPException(status_code=404, detail="Save state file no longer exists on disk")

    return FileResponse(
        ss.data_path,
        media_type="application/octet-stream",
        filename=f"game_{game_id}_slot_{slot}.sav",
    )


@router.delete("/{game_id}/save-states/{save_id}")
def delete_save_state(request: Request, game_id: int, save_id: int, db: Session = Depends(_get_db)):
    """Delete a specific save state, removing files from disk."""
    ss = db.query(GameSaveState).filter_by(id=save_id, game_id=game_id).first()
    if not ss:
        raise HTTPException(status_code=404, detail="Save state not found")

    if ss.data_path and os.path.isfile(ss.data_path):
        os.remove(ss.data_path)
    if ss.screenshot_path and os.path.isfile(ss.screenshot_path):
        os.remove(ss.screenshot_path)

    db.delete(ss)
    db.commit()
    return {"message": "Save state deleted", "id": save_id}


# ── Favorite ───────────────────────────────────────────────────────

@router.post("/{game_id}/favorite")
def toggle_favorite(request: Request, game_id: int, db: Session = Depends(_get_db)):
    """Toggle the favorite status of a game."""
    game = db.query(Game).filter_by(id=game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    game.favorite = not game.favorite
    db.commit()
    db.refresh(game)
    return game.to_json()


# ── Overview & Stats ───────────────────────────────────────────────

@router.get("/overview")
def games_overview(request: Request, db: Session = Depends(_get_db), pdb: Session = Depends(_get_private_db)):
    """Dashboard overview: stats, recently added games, platform breakdown."""
    from .library_models import RomFile

    total_games = db.query(Game).count()
    total_platforms = db.query(Game.platform).filter(Game.platform.isnot(None)).distinct().count()
    total_saves = db.query(GameSaveState).count()

    recent_games = (
        db.query(Game)
        .order_by(Game.created_at.desc())
        .limit(12)
        .all()
    )

    game_ids = [g.id for g in recent_games]
    file_map: dict[int, int | None] = {}
    if game_ids:
        rom_rows = pdb.query(RomFile.game_id, RomFile.id).filter(RomFile.game_id.in_(game_ids)).all()
        for gid, fid in rom_rows:
            file_map.setdefault(gid, fid)

    recently_added = []
    for g in recent_games:
        data = g.to_json()
        data["file_id"] = file_map.get(g.id)
        recently_added.append(data)

    platform_rows = (
        db.query(Game.platform, func.count(Game.id))
        .filter(Game.platform.isnot(None))
        .group_by(Game.platform)
        .order_by(func.count(Game.id).desc())
        .all()
    )
    platforms = [{"name": p, "count": c} for p, c in platform_rows]

    # Favorites
    fav_games = (
        db.query(Game)
        .filter(Game.favorite == True)  # noqa: E712
        .order_by(Game.title)
        .limit(12)
        .all()
    )
    fav_ids = [g.id for g in fav_games]
    fav_file_map: dict[int, int | None] = {}
    if fav_ids:
        fav_rom_rows = pdb.query(RomFile.game_id, RomFile.id).filter(RomFile.game_id.in_(fav_ids)).all()
        for gid, fid in fav_rom_rows:
            fav_file_map.setdefault(gid, fid)

    favorites = []
    for g in fav_games:
        data = g.to_json()
        data["file_id"] = fav_file_map.get(g.id)
        data["cover_url"] = f"/api/{g.cover_path}" if g.cover_path and not g.cover_path.startswith("/") else g.cover_path
        favorites.append(data)

    for item in recently_added:
        cp = item.get("cover_path")
        item["cover_url"] = f"/api/{cp}" if cp and not cp.startswith("/") else cp

    return {
        "stats": {
            "total_games": total_games,
            "total_platforms": total_platforms,
            "total_play_time_minutes": total_saves * 5,
        },
        "recently_played": recently_added,
        "favorites": favorites,
        "platforms": platforms,
    }


@router.get("/library")
def games_library(
    request: Request,
    q: str | None = Query(None),
    platform: str | None = Query(None),
    db: Session = Depends(_get_db),
    pdb: Session = Depends(_get_private_db),
):
    """Full game library with search/filter, includes file_id from ROM DB."""
    from .library_models import RomFile

    query = db.query(Game)
    if q:
        query = query.filter(Game.title.ilike(f"%{q}%"))
    if platform:
        query = query.filter(Game.platform == platform)
    games = query.order_by(Game.title).all()

    game_ids = [g.id for g in games]
    file_map: dict[int, int | None] = {}
    if game_ids:
        rom_rows = pdb.query(RomFile.game_id, RomFile.id).filter(RomFile.game_id.in_(game_ids)).all()
        for gid, fid in rom_rows:
            file_map.setdefault(gid, fid)

    result = []
    for g in games:
        data = g.to_json()
        data["file_id"] = file_map.get(g.id)
        data["cover_url"] = f"/api/{g.cover_path}" if g.cover_path and not g.cover_path.startswith("/") else g.cover_path
        result.append(data)

    all_platforms = (
        db.query(Game.platform)
        .filter(Game.platform.isnot(None))
        .distinct()
        .order_by(Game.platform)
        .all()
    )

    return {
        "games": result,
        "total": len(result),
        "platforms": [p[0] for p in all_platforms],
    }


@router.get("/stats")
def games_stats(request: Request, db: Session = Depends(_get_db)):
    """Detailed statistics: platforms, genres, decades."""
    total_games = db.query(Game).count()
    total_platforms = db.query(Game.platform).filter(Game.platform.isnot(None)).distinct().count()
    total_saves = db.query(GameSaveState).count()

    top_platforms = (
        db.query(Game.platform, func.count(Game.id))
        .filter(Game.platform.isnot(None))
        .group_by(Game.platform)
        .order_by(func.count(Game.id).desc())
        .all()
    )

    genre_rows = (
        db.query(Game.genre, func.count(Game.id))
        .filter(Game.genre.isnot(None))
        .group_by(Game.genre)
        .order_by(func.count(Game.id).desc())
        .all()
    )

    decade_rows = (
        db.query(
            ((Game.year / 10) * 10).label("decade"),
            func.count(Game.id),
        )
        .filter(Game.year.isnot(None))
        .group_by("decade")
        .order_by("decade")
        .all()
    )

    return {
        "summary": {
            "total_games": total_games,
            "platforms": total_platforms,
            "total_saves": total_saves,
        },
        "top_platforms": [{"name": p, "game_count": c} for p, c in top_platforms],
        "genres": [{"name": g, "count": c} for g, c in genre_rows],
        "decades": [{"decade": f"{int(d)}s", "count": c} for d, c in decade_rows],
    }


# ── Settings Aliases ───────────────────────────────────────────────

@router.get("/settings")
def get_settings(request: Request):
    """Combined IGDB + library status."""
    igdb_data = igdb_status(request)
    lib_data = library_status(request)
    return {"igdb": igdb_data, "library": lib_data}


@router.post("/settings/credentials")
async def settings_credentials(request: Request):
    """Alias for /igdb/configure."""
    return await configure_igdb(request)


@router.post("/settings/folders")
async def settings_folders(request: Request):
    """Alias for /library/configure."""
    return await library_configure(request)


# ── Scan Aliases ───────────────────────────────────────────────────

@router.post("/scan")
async def scan_library(request: Request):
    """Alias for /library/scan."""
    return await library_scan(request)


@router.get("/scan/status")
def scan_status(request: Request):
    """Alias for /library/status."""
    return library_status(request)
