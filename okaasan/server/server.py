"""Recipes server — FastAPI application with SQLite database and JSON file storage."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import asyncio

from fastapi import FastAPI, Depends, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import StreamingResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

import okaasan as _recipes_pkg
from .decorators import expose
from .models.common import Base
from . import gitsync, updater

log = logging.getLogger("okaasan")

from .paths import (
    STATIC_FOLDER, ORIGINALS_FOLDER,
    private_folder, public_folder, cache_folder,
)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

_PACKAGE_DIR = Path(__file__).resolve().parent
_BUNDLED_STATIC = _PACKAGE_DIR / "static"


class _StripApiPrefix:
    """ASGI middleware that rewrites ``/api/…`` → ``/…``.

    In dev the Vite proxy performs this rewrite; in production the bundled
    UI is served directly by FastAPI so we need to do it ourselves.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and scope["path"].startswith("/api/"):
            scope = dict(scope)
            scope["path"] = scope["path"][4:]
            if "raw_path" in scope:
                scope["raw_path"] = scope["raw_path"][4:]
        await self.app(scope, receive, send)


def create_app() -> FastAPI:
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("okaasan").setLevel(logging.DEBUG)

    app = FastAPI(title="Recipes")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from .query_context import _public_only

    class PublicOnlyMiddleware:
        """Pure ASGI middleware that sets the public_only ContextVar when the
        static builder sends ``X-Public-Only: true``.  Unlike BaseHTTPMiddleware,
        this passes WebSocket connections through without interference."""

        def __init__(self, app):
            self.app = app

        async def __call__(self, scope, receive, send):
            if scope["type"] == "http":
                headers = dict(scope.get("headers", []))
                if headers.get(b"x-public-only") == b"true":
                    token = _public_only.set(True)
                    try:
                        await self.app(scope, receive, send)
                    finally:
                        _public_only.reset(token)
                    return
            await self.app(scope, receive, send)

    app.add_middleware(PublicOnlyMiddleware)

    from .audit import activate as activate_audit
    activate_audit()

    from sqlalchemy import event

    def _set_sqlite_pragmas(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

    db_path = os.path.join(STATIC_FOLDER, "database.db")
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_pre_ping=True,
    )
    event.listen(engine, "connect", _set_sqlite_pragmas)
    SessionLocal = sessionmaker(bind=engine)

    private_db_path = os.path.join(str(private_folder()), "database.db")
    private_engine = create_engine(
        f"sqlite:///{private_db_path}",
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_pre_ping=True,
    )
    event.listen(private_engine, "connect", _set_sqlite_pragmas)

    from .shows.library_models import MediaFile  # noqa: F401 — registers table
    from .comics.library_models import ComicFile  # noqa: F401 — registers table
    from .music.library_models import MusicFile  # noqa: F401 — registers table
    from .podcasts.library_models import PodcastDownload  # noqa: F401 — registers table
    from .audiobooks.library_models import AudiobookFile  # noqa: F401 — registers table
    from .audiobooks.models import Audiobook, AudiobookChapter, ListeningProgress  # noqa: F401
    from .books.library_models import BookFile  # noqa: F401 — registers table
    from .books.models import Book, ReadingProgress  # noqa: F401
    from .games.library_models import RomFile  # noqa: F401 — registers table
    from .games.models import Game, GameSaveState  # noqa: F401
    try:
        from .integrations.qbittorrent.models import CompletedDownload  # noqa: F401
    except Exception:
        pass

    Base.metadata.create_all(bind=engine)
    Base.metadata.create_all(bind=private_engine)

    # Lightweight schema migration: add missing columns to existing tables
    from sqlalchemy import inspect as sa_inspect, text
    for _engine in (engine, private_engine):
        insp = sa_inspect(_engine)
        for table_name in Base.metadata.tables:
            if not insp.has_table(table_name):
                continue
            existing_cols = {c["name"] for c in insp.get_columns(table_name)}
            model_table = Base.metadata.tables[table_name]
            for col in model_table.columns:
                if col.name not in existing_cols:
                    col_type = col.type.compile(dialect=_engine.dialect)
                    default = ""
                    if col.server_default is not None:
                        default = f" DEFAULT {col.server_default.arg}"
                    with _engine.begin() as conn:
                        conn.execute(text(
                            f"ALTER TABLE {table_name} ADD COLUMN {col.name} {col_type}{default}"
                        ))

    public_folder()  # ensure uploads/ directory exists
    from .music.listening_db import _listening_dir
    _listening_dir()  # ensure listening_history/ directory exists

    def get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.state.get_db = get_db
    app.state.SessionLocal = SessionLocal
    app.state.static_folder = STATIC_FOLDER
    app.state.upload_folder = str(public_folder())
    app.state.originals_folder = ORIGINALS_FOLDER
    app.state.private_engine = private_engine

    from .route_keyvalue import router as kv_router
    from .route_images import router as images_router
    from .route_jsonstore import router as jsonstore_router
    from .route_private_jsonstore import router as private_jsonstore_router
    from .projects.graph import router as graph_router

    from .calendar import router as calendar_router
    from .tasks import router as tasks_router
    from .recipe import router as recipe_router
    from .recipe import ingredient_router, units_router
    from .articles import router as article_router
    from .feed.routes import router as feed_router
    from .shows import router as shows_router
    from .audiobooks import router as audiobooks_router
    from .books import router as books_router
    from .music import router as music_router
    from .podcasts import router as podcasts_router
    from .games import router as games_router
    from .comics import router as comics_router
    from .news import router as news_router
    from .computers import router as computers_router
    from .investing import router as investing_router

    app.include_router(kv_router)
    app.include_router(calendar_router)
    app.include_router(tasks_router)
    app.include_router(recipe_router)
    app.include_router(units_router)
    app.include_router(article_router)
    app.include_router(ingredient_router)
    app.include_router(images_router)
    app.include_router(jsonstore_router)
    app.include_router(private_jsonstore_router)
    app.include_router(graph_router)
    app.include_router(feed_router)
    app.include_router(shows_router)
    app.include_router(audiobooks_router)
    app.include_router(books_router)
    app.include_router(music_router)
    app.include_router(podcasts_router)
    app.include_router(games_router)
    app.include_router(comics_router)
    app.include_router(news_router)
    app.include_router(computers_router)
    app.include_router(investing_router)

    # Auto-import Trakt data if shows tables are empty
    from .shows.models import Media as _ShowsMedia
    _shows_db = SessionLocal()
    try:
        if _shows_db.query(_ShowsMedia).count() == 0:
            shows_dir = os.path.join(STATIC_FOLDER, "shows")
            if os.path.isdir(shows_dir):
                from .shows.importer import import_trakt_data
                from .shows.routes import _get_tmdb_client_for_import
                _tmdb_for_import = _get_tmdb_client_for_import(STATIC_FOLDER)
                import_trakt_data(_shows_db, Path(shows_dir), base_dir=Path(STATIC_FOLDER), tmdb_client=_tmdb_for_import)
    except Exception as e:
        log.warning("Auto-import of Trakt data failed: %s", e)
    finally:
        _shows_db.close()

    # Auto-import Kitsu/MAL anime dump in background (doesn't block server)
    kitsu_dumps_dir = Path(STATIC_FOLDER) / "dumps" / "kitsu"
    kitsu_marker = private_folder() / "_kitsu_imported.marker"
    if kitsu_dumps_dir.is_dir() and not kitsu_marker.exists():
        import threading

        def _run_kitsu_import():
            _kitsu_db = SessionLocal()
            try:
                from .shows.importer import import_kitsu_data
                import_kitsu_data(_kitsu_db, kitsu_dumps_dir)
                kitsu_marker.write_text("done")
            except Exception as e:
                log.warning("Auto-import of Kitsu data failed: %s", e)
            finally:
                _kitsu_db.close()

        threading.Thread(target=_run_kitsu_import, name="kitsu-import", daemon=True).start()
        log.info("Kitsu import started in background thread")

    # Start media library background scanner
    from .shows.library import LibraryScanner
    from .shows import routes as _shows_routes
    _library_scanner = LibraryScanner(STATIC_FOLDER, private_engine, engine)
    _shows_routes._library_scanner = _library_scanner
    _library_scanner.start()

    # Start book library background scanner
    from .books.library import BookLibraryScanner
    from .books import routes as _books_routes
    _book_scanner = BookLibraryScanner(STATIC_FOLDER, private_engine, engine)
    _books_routes._library_scanner = _book_scanner
    _book_scanner.start()

    # Start audiobook library background scanner
    from .audiobooks.library import AudiobookLibraryScanner
    from .audiobooks import routes as _audiobooks_routes
    _ab_scanner = AudiobookLibraryScanner(STATIC_FOLDER, private_engine, engine)
    _audiobooks_routes._library_scanner = _ab_scanner
    _ab_scanner.start()

    # Start music library background scanner
    from .music.library import MusicLibraryScanner
    from .music import routes as _music_routes
    _music_scanner = MusicLibraryScanner(STATIC_FOLDER, private_engine, engine)
    _music_routes._music_scanner = _music_scanner
    _music_scanner.start()

    # Start ROM library background scanner
    from .games.library import GameLibraryScanner
    from .games import routes as _games_routes
    _game_scanner = GameLibraryScanner(STATIC_FOLDER, private_engine, engine)
    _games_routes._library_scanner = _game_scanner
    _game_scanner.start()

    # Start podcast feed refresher
    from .podcasts.rss_fetcher import PodcastRefresher
    from .podcasts import routes as _podcasts_routes
    _podcast_refresher = PodcastRefresher(SessionLocal, interval_minutes=30)
    _podcasts_routes._refresher = _podcast_refresher
    _podcast_refresher.start()

    # Start news feed refresher
    from .news.routes import start_refresher as _start_news_refresher
    _start_news_refresher(SessionLocal)

    # Start comic library background scanner
    from .comics.library import ComicLibraryScanner
    from .comics import routes as _comics_routes
    _comic_scanner = ComicLibraryScanner(STATIC_FOLDER, private_engine, engine)
    _comics_routes._library_scanner = _comic_scanner
    _comic_scanner.start()

    # Third-party integrations (USDA, Google Calendar, Telegram, etc.)
    from .integrations import register_integrations
    register_integrations(app, engine, private_engine=private_engine)

    # Torrent discovery (search + DHT crawling) — separate DB for high-write crawl data
    try:
        from .discover import create_discover_router

        discover_db_path = os.path.join(str(private_folder()), "discover.db")
        discover_engine = create_engine(
            f"sqlite:///{discover_db_path}",
            connect_args={"check_same_thread": False, "timeout": 30},
            pool_pre_ping=True,
        )
        event.listen(discover_engine, "connect", _set_sqlite_pragmas)

        discover_router = create_discover_router(discover_engine)
        app.include_router(discover_router)
    except Exception as exc:
        log.warning("Torrent discover routes not available: %s", exc)

    # Dedicated DB for computer tasks (avoids bloating the main database)
    from .computers.models import TaskBase
    tasks_db_path = os.path.join(str(private_folder()), "computer_tasks.db")
    tasks_engine = create_engine(
        f"sqlite:///{tasks_db_path}",
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_pre_ping=True,
    )
    event.listen(tasks_engine, "connect", _set_sqlite_pragmas)
    TaskBase.metadata.create_all(bind=tasks_engine)
    TasksSessionLocal = sessionmaker(bind=tasks_engine)

    # Drop legacy computer_tasks from the main and private DBs
    for _eng in (engine, private_engine):
        _insp = sa_inspect(_eng)
        if _insp.has_table("computer_tasks"):
            with _eng.begin() as conn:
                conn.execute(text("DROP TABLE computer_tasks"))
            log.info("Dropped legacy computer_tasks table from %s", _eng.url)

    def get_tasks_db():
        db = TasksSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.state.get_tasks_db = get_tasks_db
    app.state.TasksSessionLocal = TasksSessionLocal

    from .computers.tasks import recover_orphaned_tasks
    recover_orphaned_tasks(TasksSessionLocal)

    # Dedicated DB for investing data (public, separate from main)
    from .investing.models import InvestingBase
    investing_db_path = os.path.join(STATIC_FOLDER, "investing.db")
    investing_engine = create_engine(
        f"sqlite:///{investing_db_path}",
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_pre_ping=True,
    )
    event.listen(investing_engine, "connect", _set_sqlite_pragmas)
    InvestingBase.metadata.create_all(bind=investing_engine)
    with investing_engine.connect() as conn:
        cols = [r[1] for r in conn.execute(text("PRAGMA table_info(option_chain_snapshots)"))]
        if "underlying_price" not in cols:
            conn.execute(text("ALTER TABLE option_chain_snapshots ADD COLUMN underlying_price FLOAT"))
            conn.commit()
    InvestingSessionLocal = sessionmaker(bind=investing_engine)
    app.state.InvestingSessionLocal = InvestingSessionLocal

    # Start investing data scheduler
    from .investing.scheduler import InvestingScheduler
    from .investing import routes as _investing_routes
    _inv_scheduler = InvestingScheduler(
        SessionLocal, InvestingSessionLocal, STATIC_FOLDER,
    )
    _investing_routes._scheduler = _inv_scheduler
    _inv_scheduler.start()

    @app.get("/health")
    def health_check():
        return {"status": "healthy"}

    from .task_registry import registry as _task_registry

    @app.get("/background-tasks")
    def get_background_tasks():
        return {"tasks": _task_registry.snapshot()}

    # WebSocket notification endpoint
    from starlette.websockets import WebSocketDisconnect
    from .notifications import hub as _notification_hub

    @app.on_event("startup")
    async def _set_hub_loop():
        _notification_hub.set_loop(asyncio.get_running_loop())

    @app.websocket("/ws")
    async def websocket_notifications(ws: WebSocket):
        await _notification_hub.connect(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            pass
        finally:
            _notification_hub.disconnect(ws)

    @app.get("/categories")
    @expose()
    def get_categories(db: Session = Depends(get_db)):
        from .models import Category
        categories = db.query(Category).all()
        return [category.to_json() for category in categories]

    @app.post("/categories", status_code=201)
    async def create_category(request: Request, db: Session = Depends(get_db)):
        from .models import Category
        try:  
            data = await request.json()
            category = Category(**data)
            db.add(category)
            db.commit()
            return category.to_json()
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(e))

    # ── Startup hooks ─────────────────────────────────────────

    store_root = Path(STATIC_FOLDER)

    @app.on_event("startup")
    async def _startup():
        gitsync.start_sync(store_root)

        settings_path = public_folder() / "data" / "_config" / "_settings.json"
        if settings_path.is_file():
            import json as _json
            with open(settings_path) as f:
                settings = _json.load(f)
            if settings.get("auto_update"):
                updater.start_update_loop(settings.get("update_interval_hours", 24))

    # ── Update API ─────────────────────────────────────────────

    @app.post("/update")
    async def trigger_update():
        return StreamingResponse(
            updater.stream_upgrade(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/version")
    def get_version():
        return {"version": _recipes_pkg.__version__}

    # ── Sidebar configuration API ─────────────────────────────

    _ALL_SECTIONS = [
        {"title": "Home",                  "href": "/"},
        {"title": "Cooking",               "href": "/cooking",             "items": ["Recipes", "Meal Plan", "Ingredients", "Compare Recipes"]},
        {"title": "Inventory & Shopping",   "href": "/inventory-shopping",  "items": ["Receipts", "Pantry", "Budget"]},
        {"title": "Planning",              "href": "/planning-section",    "items": ["Calendar", "Routine", "Tasks", "Projects"]},
        {"title": "Home Management",       "href": "/home-management",     "items": ["Computers", "Home", "Sensors", "Switches", "AI"]},
        {"title": "Investing",             "href": "/investing",           "items": ["Overview"]},
        {"title": "Health",                "href": "/health",              "items": ["Dashboard"]},
        {"title": "Shows & Movies",        "href": "/shows",               "items": ["Overview", "Discover", "History", "Watchlist", "Stats", "Collections", "Library"]},
        {"title": "Music",                 "href": "/music",               "items": ["Overview", "Discover", "Library", "Playlists", "Stats", "Schedule"]},
        {"title": "Audiobooks",            "href": "/audiobooks",          "items": ["Overview", "Library", "Stats"]},
        {"title": "Podcasts",              "href": "/podcasts",            "items": ["Overview", "Library", "Stats"]},
        {"title": "Books",                 "href": "/books",               "items": ["Overview", "Library", "Stats"]},
        {"title": "Comics & Manga",        "href": "/comics",              "items": ["Overview", "Library", "Stats"]},
        {"title": "Retro Games",           "href": "/games",               "items": ["Overview", "Library", "Stats"]},
        {"title": "Downloads",             "href": "/torrents",            "items": ["Downloads", "Discover", "Crawler"]},
        {"title": "Feed",                  "href": "/feed"},
        {"title": "World News",            "href": "/news"},
        {"title": "Notes",                 "href": "/content"},
        {"title": "Units",                 "href": "/units",               "items": ["Unit Conversions", "Unit Manager"]},
        {"title": "Expense Tracker",       "href": "/expense-tracker",     "items": ["Entries", "Summary", "Tax Summary", "Types", "From", "Bank", "Details"]},
        {"title": "Scratch",               "href": "/scratch",             "items": ["Code Visualization", "Article Blocks", "Filament Math", "Wood Planner", "Brainstorm", "Print Cost"]},
    ]

    def _sidebar_config_path():
        return public_folder() / "data" / "_config" / "_sidebar.json"

    def _load_sidebar_config() -> dict:
        p = _sidebar_config_path()
        if p.is_file():
            with open(p) as f:
                return json.load(f)
        return {}

    # Map sidebar titles to their config files in private/
    _MEDIA_CONFIG_FILES: dict[str, str] = {
        "Shows & Movies": "_library.json",
        "Music": "_music.json",
        "Audiobooks": "_audiobooks.json",
        "Books": "_books.json",
        "Comics & Manga": "_comics.json",
        "Podcasts": "_podcasts.json", 
        "Retro Games": "_games.json",
    }

    # ── Scan schedule API ──────────────────────────────────────

    @app.get("/scan/schedule")
    def get_scan_schedule():
        """Return the current scan schedule settings (reads from first available config)."""
        priv = private_folder()
        for config_file in _MEDIA_CONFIG_FILES.values():
            p = priv / config_file
            if p.is_file():
                try:
                    with open(p) as f:
                        cfg = json.load(f)
                    return {
                        "scan_mode": cfg.get("scan_mode", "daily"),
                        "scan_hour": cfg.get("scan_hour", 1),
                        "scan_timezone": cfg.get("scan_timezone", "UTC"),
                        "scan_interval_minutes": cfg.get("scan_interval_minutes", 1440),
                    }
                except (ValueError, OSError):
                    pass
        return {"scan_mode": "daily", "scan_hour": 1, "scan_timezone": "UTC", "scan_interval_minutes": 1440}

    @app.post("/scan/schedule")
    async def set_scan_schedule(request: Request):
        """Update scan schedule for all configured media libraries."""
        data = await request.json()
        scan_mode = data.get("scan_mode", "daily")
        scan_hour = int(data.get("scan_hour", 1))
        scan_timezone = data.get("scan_timezone", "UTC")
        scan_interval_minutes = int(data.get("scan_interval_minutes", 1440))

        priv = private_folder()
        updated = 0
        for config_file in _MEDIA_CONFIG_FILES.values():
            p = priv / config_file
            if p.is_file():
                try:
                    with open(p) as f:
                        cfg = json.load(f)
                    cfg["scan_mode"] = scan_mode
                    cfg["scan_hour"] = scan_hour
                    cfg["scan_timezone"] = scan_timezone
                    cfg["scan_interval_minutes"] = scan_interval_minutes
                    with open(p, "w") as f:
                        json.dump(cfg, f, indent=2)
                    updated += 1
                except (ValueError, OSError):
                    pass
        return {
            "updated": updated,
            "scan_mode": scan_mode,
            "scan_hour": scan_hour,
            "scan_timezone": scan_timezone,
            "scan_interval_minutes": scan_interval_minutes,
        }

    def _get_configured_media() -> set[str]:
        """Return set of sidebar titles whose media sections have been configured."""
        configured = set()
        priv = private_folder()
        for title, config_file in _MEDIA_CONFIG_FILES.items():
            p = priv / config_file
            if p.is_file():
                try:
                    with open(p) as f:
                        cfg = json.load(f)
                    folders = cfg.get("folders", {})
                    if isinstance(folders, list):
                        has_folders = len(folders) > 0
                    elif isinstance(folders, dict):
                        has_folders = any(
                            isinstance(v, list) and len(v) > 0
                            for v in folders.values()
                        )
                    else:
                        has_folders = False
                    has_api_key = bool(cfg.get("api_key") or cfg.get("client_id"))
                    if has_folders or has_api_key:
                        configured.add(title)
                except (json.JSONDecodeError, OSError):
                    pass
        return configured

    _DEFAULT_STATIC_HIDDEN = [
        "Downloads", "Feed", "World News",
        "Planning", "Inventory & Shopping", "Home Management",
        "Health", "Investing", "Expense Tracker",
    ]

    @app.get("/sidebar")
    @expose()
    def get_sidebar():
        cfg = _load_sidebar_config()
        hidden = set(cfg.get("hidden", []))
        static_hidden = set(cfg.get("static_hidden", _DEFAULT_STATIC_HIDDEN))
        configured_media = _get_configured_media()
        # Auto-hide media sections that aren't configured yet
        unconfigured = set(_MEDIA_CONFIG_FILES.keys()) - configured_media
        effective_hidden = hidden | unconfigured
        sections = [s for s in _ALL_SECTIONS if s["title"] not in effective_hidden]
        return {
            "sections": sections,
            "all_sections": _ALL_SECTIONS,
            "hidden": list(hidden),
            "static_hidden": list(static_hidden),
            "configured_media": list(configured_media),
        }

    @app.put("/sidebar")
    async def put_sidebar(request: Request):
        body = await request.json()
        cfg = _load_sidebar_config()
        if "hidden" in body:
            cfg["hidden"] = body["hidden"]
        if "static_hidden" in body:
            cfg["static_hidden"] = body["static_hidden"]
        folder = public_folder() / "data" / "_config"
        folder.mkdir(parents=True, exist_ok=True)
        with open(folder / "_sidebar.json", "w") as f:
            json.dump(cfg, f, indent=2)
        gitsync.notify_write()
        return {"message": "Saved"}

    # ── Git configuration API ─────────────────────────────────

    @app.get("/git/status")
    async def git_status():
        status = gitsync.get_status(store_root)
        status["data_path"] = str(store_root.resolve())
        return status

    @app.post("/git/generate-key")
    async def git_generate_key():
        loop = asyncio.get_event_loop()
        pub = await loop.run_in_executor(None, gitsync.generate_ssh_key)
        return {"public_key": pub}

    @app.get("/git/ssh-key")
    async def git_ssh_key():
        pub = gitsync.get_ssh_public_key()
        if pub is None:
            raise HTTPException(status_code=404, detail="No SSH key generated yet")
        return {"public_key": pub}

    @app.post("/git/setup")
    async def git_setup(request: Request):
        body = await request.json()
        remote = body.get("remote", "").strip()
        if not remote:
            raise HTTPException(status_code=400, detail="remote is required")

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, gitsync.git_init, store_root, remote)

        result = await loop.run_in_executor(None, gitsync.git_sync, store_root)
        gitsync.ensure_sync_running(store_root)

        resp = {"message": "Git configured", "remote": remote, "commit": result.commit}
        if result.push_error:
            resp["push_error"] = result.push_error
        if result.error:
            resp["error"] = result.error
        return resp

    @app.post("/git/sync")
    async def git_trigger_sync():
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, gitsync.git_sync, store_root)
        resp = {"commit": result.commit, "pushed": result.pushed}
        if result.push_error:
            resp["push_error"] = result.push_error
        if result.error:
            resp["error"] = result.error
        return resp

    @app.post("/git/test")
    async def git_test_connection():
        loop = asyncio.get_event_loop()

        def _test():
            import subprocess
            r = subprocess.run(
                ["ssh", "-T", "-o", "StrictHostKeyChecking=accept-new",
                 "git@github.com-okaasan"],
                capture_output=True, text=True, timeout=15,
            )
            output = (r.stdout + r.stderr).strip()
            return r.returncode == 1 and "successfully authenticated" in output.lower(), output

        ok, output = await loop.run_in_executor(None, _test)
        return {"connected": ok, "output": output}

    # ── GitHub Pages setup ─────────────────────────────────────

    @app.get("/git/pages-status")
    async def git_pages_status():
        workflow = store_root / ".github" / "workflows" / "deploy.yml"
        remote = gitsync.get_remote(store_root)
        repo_name = ""
        pages_url = ""
        if remote:
            # git@github.com:user/repo.git -> repo
            parts = remote.rstrip(".git").rsplit("/", 1)
            if len(parts) == 2:
                repo_name = parts[1]
                owner = parts[0].rsplit(":", 1)[-1].rsplit("/", 1)[-1]
                pages_url = f"https://{owner}.github.io/{repo_name}/"
        return {
            "workflow_exists": workflow.is_file(),
            "repo_name": repo_name,
            "pages_url": pages_url,
        }

    @app.post("/git/setup-pages")
    async def git_setup_pages():
        if not gitsync.is_git_repo(store_root):
            raise HTTPException(status_code=400, detail="Git backup not configured")

        remote = gitsync.get_remote(store_root)
        if not remote:
            raise HTTPException(status_code=400, detail="No git remote configured")

        # Infer repo name from remote URL
        repo_name = remote.rstrip(".git").rsplit("/", 1)[-1]
        base_path = f"/{repo_name}/"

        # Read template
        template_path = _PACKAGE_DIR / "templates" / "deploy-pages.yml"
        if not template_path.is_file():
            raise HTTPException(status_code=500, detail="Workflow template not found")

        template = template_path.read_text()
        okaasan_repo = getattr(_recipes_pkg, '__url__', None) or "https://github.com/Delaunay/okaasan"
        if okaasan_repo.endswith("/"):
            okaasan_repo = okaasan_repo[:-1]
        workflow_content = (
            template
            .replace("{{BASE_PATH}}", base_path)
            .replace("{{OKAASAN_REPO}}", okaasan_repo)
        )

        # Write workflow to data repo
        workflow_dir = store_root / ".github" / "workflows"
        workflow_dir.mkdir(parents=True, exist_ok=True)
        (workflow_dir / "deploy.yml").write_text(workflow_content)

        # Commit and push
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, gitsync.git_sync, store_root)

        resp = {
            "message": "GitHub Pages workflow added",
            "base_path": base_path,
            "commit": result.commit,
        }
        if result.push_error:
            resp["push_error"] = result.push_error
            resp["message"] = f"Workflow added but push failed: {result.push_error}"
        if result.error:
            resp["error"] = result.error
        return resp

    # ── Bundled UI static files ───────────────────────────────

    static_dir = _BUNDLED_STATIC
    index_html = static_dir / "index.html"

    if static_dir.is_dir() and index_html.is_file():
        app.mount(
            "/assets",
            StaticFiles(directory=str(static_dir / "assets")),
            name="static-assets",
        )

        @app.get("/favicon.ico")
        async def favicon():
            path = static_dir / "favicon.ico"
            if path.is_file():
                return FileResponse(str(path))
            raise HTTPException(status_code=404)

        _API_PREFIXES = ("store/", "health", "kv/", "events", "tasks",
                         "recipes", "ingredients", "articles", "article/",
                         "blocks/", "units", "unit/", "upload", "download-image",
                         "uploads/", "routine/", "planning/", "kiwi/", "categories",
                         "ingredient/", "sidebar", "version", "update",
                         "git/", "usda/", "subtasks",
                         "gcalendar/", "garmin/", "weather/",
                         "health-data/", "shows/", "audiobooks/", "books/", "music/",
                         "comics/", "games/", "investing/")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith(_API_PREFIXES):
                raise HTTPException(status_code=404)
            requested = static_dir / full_path
            if full_path and requested.is_file():
                return FileResponse(str(requested))
            return HTMLResponse(index_html.read_text())

    return app
