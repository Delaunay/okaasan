"""API routes for qBittorrent integration."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel

from ...paths import private_folder, logs_folder, STATIC_FOLDER
from .client import QBitClient
from . import process as qbt_process
from .catalog import handle_completed

log = logging.getLogger("okaasan.qbittorrent")

_CONFIG_FILE = "_qbittorrent.json"

_client: QBitClient | None = None


def _config_path() -> Path:
    return private_folder() / _CONFIG_FILE


def _load_config() -> dict[str, Any]:
    p = _config_path()
    if p.is_file():
        try:
            return json.loads(p.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "host": "localhost",
        "port": 8082,
        "username": "admin",
        "password": "adminadmin",
        "auto_start": False,
        "qbittorrent_nox_path": None,
    }


def _save_config(config: dict[str, Any]) -> None:
    p = _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(config, indent=2))


def _get_client() -> QBitClient:
    global _client
    if _client is None:
        cfg = _load_config()
        _client = QBitClient(
            host=cfg.get("host", "localhost"),
            port=cfg.get("port", 8082),
            username=cfg.get("username", "admin"),
            password=cfg.get("password", "adminadmin"),
        )
    return _client


def _get_destinations() -> dict[str, str]:
    """Build a category→folder mapping from existing library configs."""
    destinations: dict[str, str] = {}

    # Shows / Movies / Anime  (private/_library.json)
    lib_path = private_folder() / "_library.json"
    if lib_path.is_file():
        try:
            lib = json.loads(lib_path.read_text())
            folders = lib.get("folders", {})
            if folders.get("shows"):
                destinations["tv"] = folders["shows"][0]
            if folders.get("movies"):
                destinations["movie"] = folders["movies"][0]
            if folders.get("anime"):
                destinations["anime"] = folders["anime"][0]
        except (json.JSONDecodeError, OSError, IndexError):
            pass

    # Music (private/_music.json)
    music_path = private_folder() / "_music.json"
    if music_path.is_file():
        try:
            mcfg = json.loads(music_path.read_text())
            folders = mcfg.get("folders", [])
            if folders:
                destinations["music"] = folders[0]
        except (json.JSONDecodeError, OSError, IndexError):
            pass

    # Books (private/_books.json)
    books_path = private_folder() / "_books.json"
    if books_path.is_file():
        try:
            bcfg = json.loads(books_path.read_text())
            folders = bcfg.get("folders", [])
            if folders:
                destinations["books"] = folders[0]
        except (json.JSONDecodeError, OSError, IndexError):
            pass

    # Games (private/_games.json)
    games_path = private_folder() / "_games.json"
    if games_path.is_file():
        try:
            gcfg = json.loads(games_path.read_text())
            folders = gcfg.get("folders", [])
            if folders:
                destinations["games"] = folders[0]
        except (json.JSONDecodeError, OSError, IndexError):
            pass

    return destinations


def create_router(private_engine, main_engine) -> APIRouter:
    router = APIRouter(prefix="/torrents", tags=["torrents"])

    # ── Process management ────────────────────────────────────────

    @router.get("/status")
    def get_status():
        proc = qbt_process.status()
        transfer = None
        version = None
        connection_error = None
        if proc["running"]:
            client = _get_client()
            try:
                if client.is_connected():
                    transfer = client.get_transfer_info()
                    version = client.get_version()
            except Exception as e:
                connection_error = str(e)
        return {
            "process": proc,
            "connected": transfer is not None,
            "transfer": transfer,
            "version": version,
            "connection_error": connection_error,
        }

    @router.post("/start")
    async def start_qbt():
        cfg = _load_config()
        try:
            pid = await qbt_process.start(
                custom_path=cfg.get("qbittorrent_nox_path"),
                webui_port=cfg.get("port", 8082),
                username=cfg.get("username", "admin"),
                password=cfg.get("password", "adminadmin"),
            )
            global _client
            _client = None
            return {"status": "started", "pid": pid}
        except Exception as e:
            log.error("Failed to start qbittorrent-nox: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/stop")
    async def stop_qbt():
        was_running = await qbt_process.stop()
        return {"status": "stopped" if was_running else "not_running"}

    # ── Torrent operations ────────────────────────────────────────

    @router.get("/list")
    def list_torrents():
        client = _get_client()
        try:
            if not client.is_connected():
                return {"torrents": []}
            torrents = client.list_torrents()
            return {"torrents": torrents}
        except Exception:
            return {"torrents": []}

    class AddTorrentRequest(BaseModel):
        url: str | None = None
        category: str | None = None

    @router.post("/add")
    async def add_torrent(
        request: Request,
        url: str | None = Form(default=None),
        category: str | None = Form(default=None),
        torrent_file: UploadFile | None = File(default=None),
    ):
        client = _get_client()
        try:
            if torrent_file and torrent_file.filename:
                content = await torrent_file.read()
                result = client.add_torrent(
                    torrent_files=content,
                    category=category,
                )
            elif url:
                result = client.add_torrent(urls=url, category=category)
            else:
                raise HTTPException(status_code=400, detail="Provide url or torrent_file")
            return {"status": "ok", "result": result}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    class TorrentHashRequest(BaseModel):
        hash: str
        delete_files: bool = False

    @router.post("/remove")
    def remove_torrent(body: TorrentHashRequest):
        client = _get_client()
        try:
            client.remove_torrent(body.hash, delete_files=body.delete_files)
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    class HashOnly(BaseModel):
        hash: str

    @router.post("/pause")
    def pause_torrent(body: HashOnly):
        client = _get_client()
        try:
            client.pause_torrent(body.hash)
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    @router.post("/resume")
    def resume_torrent(body: HashOnly):
        client = _get_client()
        try:
            client.resume_torrent(body.hash)
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    # ── Completion webhook (called by qBittorrent) ────────────────

    class CompletedPayload(BaseModel):
        hash: str
        name: str
        category: str = ""
        save_path: str = ""
        content_path: str = ""
        size: str | int | None = None

    @router.post("/completed")
    def torrent_completed(payload: CompletedPayload):
        try:
            result = handle_completed(
                torrent_hash=payload.hash,
                name=payload.name,
                category=payload.category,
                save_path=payload.save_path,
                content_path=payload.content_path,
                size=payload.size,
                private_engine=private_engine,
                main_engine=main_engine,
                static_folder=STATIC_FOLDER,
            )
            return result
        except Exception as e:
            log.error("Failed to process completed torrent %s: %s", payload.hash[:8], e)
            raise HTTPException(status_code=500, detail=str(e))

    # ── History ───────────────────────────────────────────────────

    @router.get("/history")
    def get_history():
        from sqlalchemy.orm import sessionmaker
        from .models import CompletedDownload

        PrivateSession = sessionmaker(bind=private_engine)
        db = PrivateSession()
        try:
            downloads = db.query(CompletedDownload).order_by(
                CompletedDownload.completed_at.desc()
            ).limit(100).all()
            return {"history": [d.to_json() for d in downloads]}
        finally:
            db.close()

    # ── Config ────────────────────────────────────────────────────

    @router.get("/config")
    def get_config():
        cfg = _load_config()
        return cfg

    @router.post("/config")
    def update_config(body: dict):
        cfg = _load_config()
        cfg.update(body)
        _save_config(cfg)

        global _client
        _client = None

        return {"status": "ok", "config": cfg}

    # ── Destinations (read-only, from library configs) ────────────

    @router.get("/destinations")
    def get_destinations():
        return {"destinations": _get_destinations()}

    # ── Category sync ─────────────────────────────────────────────

    @router.post("/sync-categories")
    def sync_categories():
        """Push library folder destinations to qBittorrent as categories."""
        client = _get_client()
        destinations = _get_destinations()
        if not destinations:
            raise HTTPException(status_code=400, detail="No library folders configured")
        try:
            client.sync_categories(destinations)
            return {"status": "ok", "categories": destinations}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    @router.get("/logs")
    def get_logs(lines: int = 100):
        """Return the last N lines of qbittorrent stdout and stderr logs."""
        logs_dir = logs_folder()
        result = {}
        for name in ("qbittorrent-stdout.log", "qbittorrent-stderr.log"):
            path = logs_dir / name
            if path.is_file():
                try:
                    all_lines = path.read_text().splitlines()
                    result[name] = all_lines[-lines:]
                except OSError:
                    result[name] = []
            else:
                result[name] = []
        return result

    @router.post("/setup-hook")
    def setup_hook():
        """Configure qBittorrent to call our completion webhook."""
        client = _get_client()
        cfg = _load_config()
        port = cfg.get("api_port", 5001)
        try:
            client.configure_completion_hook(api_base=f"http://localhost:{port}")
            return {"status": "ok"}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    return router
