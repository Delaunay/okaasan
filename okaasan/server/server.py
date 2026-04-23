"""Recipes server — FastAPI application with SQLite database and JSON file storage."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import asyncio

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import StreamingResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

import okaasan as _recipes_pkg
from .models.common import Base
from . import gitsync, updater

log = logging.getLogger("okaasan")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

STATIC_FOLDER_DEFAULT = os.path.join(ROOT, 'static')
STATIC_FOLDER = os.path.abspath(
    os.getenv("OKAASAN_DATA") or os.getenv("FLASK_STATIC", STATIC_FOLDER_DEFAULT)
)
STATIC_UPLOAD_FOLDER = os.path.join(STATIC_FOLDER, 'uploads')
ORIGINALS_FOLDER = '/mnt/xshare/projects/recipes/originals'

_PACKAGE_DIR = Path(__file__).resolve().parent
_BUNDLED_STATIC = _PACKAGE_DIR / "static"


def create_app() -> FastAPI:
    app = FastAPI(title="Recipes")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    db_path = os.path.join(STATIC_FOLDER, "database.db")
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(bind=engine)

    Base.metadata.create_all(bind=engine)

    os.makedirs(STATIC_UPLOAD_FOLDER, exist_ok=True)

    def get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.state.get_db = get_db
    app.state.static_folder = STATIC_FOLDER
    app.state.upload_folder = STATIC_UPLOAD_FOLDER
    app.state.originals_folder = ORIGINALS_FOLDER

    from .route_keyvalue import router as kv_router
    from .route_calendar import router as calendar_router
    from .route_tasks import router as tasks_router
    from .route_recipe import router as recipe_router
    from .route_ingredient import router as ingredient_router
    from .route_article import router as article_router
    from .route_units import router as units_router
    from .route_images import router as images_router
    from .route_jsonstore import router as jsonstore_router
    from .route_usda import create_usda_routers
    from .route_messaging import router as messaging_router
    from .projects.graph import router as graph_router

    app.include_router(kv_router)
    app.include_router(calendar_router)
    app.include_router(tasks_router)
    app.include_router(recipe_router)
    app.include_router(ingredient_router)
    app.include_router(article_router)
    app.include_router(units_router)
    app.include_router(images_router)
    app.include_router(jsonstore_router)
    app.include_router(messaging_router)
    app.include_router(graph_router)

    try:
        fdc_router, csv_router = create_usda_routers(engine)
        app.include_router(fdc_router)
        app.include_router(csv_router)
    except Exception:
        log.warning("USDA routes not available (missing usda_fdc or data)")

    @app.get("/health")
    def health_check():
        return {"status": "healthy"}

    @app.get("/categories")
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

        settings_path = Path(STATIC_UPLOAD_FOLDER) / "data" / "_config" / "_settings.json"
        if settings_path.is_file():
            import json as _json
            with open(settings_path) as f:
                settings = _json.load(f)
            if settings.get("auto_update"):
                updater.start_update_loop(settings.get("update_interval_hours", 24))

    # ── Update API ─────────────────────────────────────────────

    @app.post("/api/update")
    async def trigger_update():
        return StreamingResponse(
            updater.stream_upgrade(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    @app.get("/api/version")
    def get_version():
        return {"version": _recipes_pkg.__version__}

    # ── Sidebar configuration API ─────────────────────────────

    _ALL_SECTIONS = [
        {"title": "Home",                  "href": "/"},
        {"title": "Cooking",               "href": "/cooking",             "items": ["Recipes", "Meal Plan", "Ingredients", "Compare Recipes"]},
        {"title": "Inventory & Shopping",   "href": "/inventory-shopping",  "items": ["Receipts", "Pantry", "Budget"]},
        {"title": "Planning",              "href": "/planning-section",    "items": ["Calendar", "Routine", "Tasks", "Projects"]},
        {"title": "Home Management",       "href": "/home-management",     "items": ["Computers", "Home", "Sensors", "Switches", "AI"]},
        {"title": "Investing",             "href": "/investing",           "items": ["Taxes", "Retirement"]},
        {"title": "Health",                "href": "/health"},
        {"title": "Notes",                 "href": "/content"},
        {"title": "Units",                 "href": "/units",               "items": ["Unit Conversions", "Unit Manager"]},
        {"title": "Expense Tracker",       "href": "/expense-tracker",     "items": ["Entries", "Summary", "Tax Summary", "Types", "From", "Bank", "Details"]},
        {"title": "Scratch",               "href": "/scratch",             "items": ["Code Visualization", "Article Blocks", "Filament Math", "Wood Planner", "Brainstorm", "Print Cost"]},
    ]

    def _sidebar_config_path():
        return Path(STATIC_UPLOAD_FOLDER) / "data" / "_config" / "_sidebar.json"

    def _load_sidebar_config() -> dict:
        p = _sidebar_config_path()
        if p.is_file():
            with open(p) as f:
                return json.load(f)
        return {}

    @app.get("/api/sidebar")
    def get_sidebar():
        cfg = _load_sidebar_config()
        hidden = set(cfg.get("hidden", []))
        static_hidden = set(cfg.get("static_hidden", []))
        sections = [s for s in _ALL_SECTIONS if s["title"] not in hidden]
        return {
            "sections": sections,
            "all_sections": _ALL_SECTIONS,
            "hidden": list(hidden),
            "static_hidden": list(static_hidden),
        }

    @app.put("/api/sidebar")
    async def put_sidebar(request: Request):
        body = await request.json()
        cfg = _load_sidebar_config()
        if "hidden" in body:
            cfg["hidden"] = body["hidden"]
        if "static_hidden" in body:
            cfg["static_hidden"] = body["static_hidden"]
        folder = Path(STATIC_UPLOAD_FOLDER) / "data" / "_config"
        folder.mkdir(parents=True, exist_ok=True)
        with open(folder / "_sidebar.json", "w") as f:
            json.dump(cfg, f, indent=2)
        gitsync.notify_write()
        return {"message": "Saved"}

    # ── Git configuration API ─────────────────────────────────

    @app.get("/api/git/status")
    async def git_status():
        status = gitsync.get_status(store_root)
        status["data_path"] = str(store_root.resolve())
        return status

    @app.post("/api/git/generate-key")
    async def git_generate_key():
        loop = asyncio.get_event_loop()
        pub = await loop.run_in_executor(None, gitsync.generate_ssh_key)
        return {"public_key": pub}

    @app.get("/api/git/ssh-key")
    async def git_ssh_key():
        pub = gitsync.get_ssh_public_key()
        if pub is None:
            raise HTTPException(status_code=404, detail="No SSH key generated yet")
        return {"public_key": pub}

    @app.post("/api/git/setup")
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

    @app.post("/api/git/sync")
    async def git_trigger_sync():
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, gitsync.git_sync, store_root)
        resp = {"commit": result.commit, "pushed": result.pushed}
        if result.push_error:
            resp["push_error"] = result.push_error
        if result.error:
            resp["error"] = result.error
        return resp

    @app.post("/api/git/test")
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

    @app.get("/api/git/pages-status")
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

    @app.post("/api/git/setup-pages")
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

        _API_PREFIXES = ("api/", "store/", "health", "kv/", "events", "tasks",
                         "recipes", "ingredients", "articles", "article/",
                         "blocks/", "units", "unit/", "upload", "download-image",
                         "uploads/", "routine/", "planning/", "kiwi/", "categories",
                         "ingredient/")

        @app.get("/{full_path:path}")
        async def serve_spa(full_path: str):
            if full_path.startswith(_API_PREFIXES):
                raise HTTPException(status_code=404)
            requested = static_dir / full_path
            if full_path and requested.is_file():
                return FileResponse(str(requested))
            return HTMLResponse(index_html.read_text())

    return app
