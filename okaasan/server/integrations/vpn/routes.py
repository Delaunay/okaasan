"""API routes for VPN integration."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ...paths import private_folder
from .base import VPNProvider
from . import monitor as vpn_monitor

log = logging.getLogger("okaasan.vpn")

_CONFIG_FILE = "_vpn.json"

_provider: VPNProvider | None = None


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
        "provider": "protonvpn",
        "auto_connect": False,
        "kill_qbt_on_disconnect": True,
        "monitor_interval": 10,
        "connect_options": {},
    }


def _save_config(config: dict[str, Any]) -> None:
    p = _config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(config, indent=2))


def _get_provider() -> VPNProvider:
    global _provider
    if _provider is None:
        cfg = _load_config()
        name = cfg.get("provider", "protonvpn")
        if name == "protonvpn":
            from .protonvpn import ProtonVPN
            _provider = ProtonVPN()
        else:
            raise RuntimeError(f"Unknown VPN provider: {name}")
    return _provider


def create_router() -> APIRouter:
    router = APIRouter(prefix="/vpn", tags=["vpn"])

    @router.get("/status")
    async def get_status():
        provider = _get_provider()
        try:
            st = await provider.status()
        except Exception as e:
            return {
                "connected": False,
                "error": str(e),
                "provider": provider.name,
                "monitor_active": vpn_monitor.is_monitoring(),
                "last_event": vpn_monitor.last_event(),
            }
        return {
            "connected": st.connected,
            "server": st.server,
            "country": st.country,
            "city": st.city,
            "ip": st.ip,
            "protocol": st.protocol,
            "load": st.load,
            "interface": st.interface,
            "provider": provider.name,
            "monitor_active": vpn_monitor.is_monitoring(),
            "last_event": vpn_monitor.last_event(),
            "extra": st.extra,
        }

    class ConnectRequest(BaseModel):
        country: str | None = None
        city: str | None = None
        server: str | None = None
        p2p: bool = False

    @router.post("/connect")
    async def connect(body: ConnectRequest):
        provider = _get_provider()
        try:
            msg = await provider.connect(
                country=body.country,
                city=body.city,
                server=body.server,
                p2p=body.p2p,
            )

            cfg = _load_config()
            if cfg.get("kill_qbt_on_disconnect", True):
                vpn_monitor.start_monitor(
                    provider,
                    check_interval=cfg.get("monitor_interval", 10),
                )

            return {"status": "ok", "message": msg}
        except Exception as e:
            log.error("VPN connect failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/disconnect")
    async def disconnect():
        vpn_monitor.stop_monitor()
        provider = _get_provider()
        try:
            msg = await provider.disconnect()
            return {"status": "ok", "message": msg}
        except Exception as e:
            log.error("VPN disconnect failed: %s", e, exc_info=True)
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/countries")
    async def list_countries():
        provider = _get_provider()
        try:
            countries = await provider.countries()
            return {"countries": countries}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @router.post("/monitor/start")
    async def start_monitor():
        provider = _get_provider()
        cfg = _load_config()
        vpn_monitor.start_monitor(
            provider,
            check_interval=cfg.get("monitor_interval", 10),
        )
        return {"status": "ok", "monitoring": True}

    @router.post("/monitor/stop")
    async def stop_monitor():
        vpn_monitor.stop_monitor()
        return {"status": "ok", "monitoring": False}

    @router.post("/bind-qbt")
    async def bind_qbt():
        """Bind qBittorrent to the VPN network interface."""
        provider = _get_provider()
        st = await provider.status()
        if not st.connected:
            raise HTTPException(status_code=400, detail="VPN is not connected")
        iface = st.interface
        if not iface:
            raise HTTPException(
                status_code=400,
                detail="Could not detect VPN interface (tun/wg). Is VPN connected?",
            )

        try:
            from ..qbittorrent.routes import _get_client
            client = _get_client()
            client.bind_interface(iface)
            return {"status": "ok", "interface": iface}
        except Exception as e:
            raise HTTPException(status_code=502, detail=str(e))

    @router.get("/config")
    def get_config():
        return _load_config()

    @router.post("/config")
    def update_config(body: dict):
        cfg = _load_config()
        cfg.update(body)
        _save_config(cfg)

        global _provider
        _provider = None

        return {"status": "ok", "config": cfg}

    return router
