"""API routes for computer management and background tasks."""
from __future__ import annotations

import asyncio
import logging
import os
import platform
import socket
import subprocess
from datetime import datetime, timezone
from typing import Optional

import httpx
import psutil
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .models import TaskRun
from . import tasks as task_runner

log = logging.getLogger("okaasan.computers")

router = APIRouter(prefix="/computers", tags=["computers"])


def _get_tasks_db(request: Request):
    """Yield a session for the dedicated computer-tasks DB."""
    yield from request.app.state.get_tasks_db()


# ---------------------------------------------------------------------------
# System info helpers
# ---------------------------------------------------------------------------

def _local_computer_summary() -> dict:
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    boot = datetime.fromtimestamp(psutil.boot_time(), tz=timezone.utc)
    uptime_sec = (datetime.now(timezone.utc) - boot).total_seconds()

    return {
        "id": "local",
        "name": platform.node(),
        "hostname": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "arch": platform.machine(),
        "cpu_count": psutil.cpu_count(logical=True),
        "cpu_pct": psutil.cpu_percent(interval=0.3),
        "ram_total": mem.total,
        "ram_used": mem.used,
        "ram_pct": mem.percent,
        "disk_total": disk.total,
        "disk_used": disk.used,
        "disk_pct": disk.percent,
        "uptime_sec": int(uptime_sec),
        "status": "online",
    }


def _local_computer_detail() -> dict:
    base = _local_computer_summary()

    # Per-partition disk usage
    partitions = []
    for p in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(p.mountpoint)
            partitions.append({
                "device": p.device,
                "mountpoint": p.mountpoint,
                "fstype": p.fstype,
                "total": usage.total,
                "used": usage.used,
                "pct": usage.percent,
            })
        except PermissionError:
            continue

    # Network interfaces
    nets = []
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()
    for name, addr_list in addrs.items():
        if name == "lo":
            continue
        ipv4 = next((a.address for a in addr_list if a.family.name == "AF_INET"), None)
        is_up = stats.get(name, None)
        nets.append({
            "name": name,
            "ip": ipv4,
            "is_up": is_up.isup if is_up else False,
            "speed_mbps": is_up.speed if is_up else 0,
        })

    # CPU temps (best-effort)
    temps = None
    try:
        t = psutil.sensors_temperatures()
        if t:
            temps = {k: [{"label": s.label, "current": s.current} for s in v] for k, v in t.items()}
    except (AttributeError, RuntimeError):
        pass

    base["partitions"] = partitions
    base["networks"] = nets
    base["temps"] = temps
    return base


# ---------------------------------------------------------------------------
# Computer endpoints
# ---------------------------------------------------------------------------

@router.get("")
def list_computers():
    return [_local_computer_summary()]


@router.get("/{computer_id}")
def get_computer(computer_id: str):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")
    return _local_computer_detail()


@router.post("/{computer_id}/shutdown")
def shutdown_computer(computer_id: str):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")
    subprocess.Popen(["sudo", "shutdown", "-h", "+1"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"status": "shutdown scheduled in 1 minute"}


@router.post("/{computer_id}/restart")
def restart_computer(computer_id: str):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")
    subprocess.Popen(["sudo", "reboot"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"status": "reboot initiated"}


# ---------------------------------------------------------------------------
# Services endpoints
# ---------------------------------------------------------------------------

_SERVICES = [
    {
        "id": "pihole",
        "name": "Pi-hole",
        "description": "Network-wide ad blocking",
        "check_url": "http://localhost:8080/admin/api.php?summaryRaw",
        "web_port": 8080,
        "web_path": "/admin",
    },
    {
        "id": "rustdesk",
        "name": "RustDesk Server",
        "description": "Remote desktop access server",
        "systemd_units": ["rustdesk-hbbs", "rustdesk-hbbr"],
    },
    {
        "id": "plex",
        "name": "Plex",
        "description": "Media server",
        "check_url": "http://localhost:32400/identity",
        "web_port": 32400,
        "web_path": "/web",
    },
    {
        "id": "stash",
        "name": "Stash",
        "description": "Media organizer",
        "check_url": "http://localhost:9999",
        "web_port": 9999,
        "web_path": "",
    },
    {
        "id": "samba",
        "name": "Samba",
        "description": "SMB file sharing",
        "check_port": 445,
    },
    {
        "id": "nfs",
        "name": "NFS",
        "description": "Network file system",
        "check_port": 2049,
    },
]


def _get_lan_ip() -> str:
    """Get the LAN-facing IP by connecting to an external target (no traffic sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "192.168.2.157"


def _check_systemd_unit(unit: str) -> bool:
    """Return True if a systemd unit is active."""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", unit],
            capture_output=True, text=True, timeout=5,
        )
        return result.stdout.strip() == "active"
    except Exception:
        return False


def _check_port(port: int) -> bool:
    """Return True if something is listening on the given TCP port."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(2)
        s.connect(("127.0.0.1", port))
        s.close()
        return True
    except Exception:
        return False


async def _check_service(svc: dict) -> dict:
    """Check a single service and return its status dict."""
    lan_ip = _get_lan_ip()
    info: dict = {
        "id": svc["id"],
        "name": svc["name"],
        "description": svc["description"],
        "status": "unknown",
        "url": None,
    }

    if "web_port" in svc:
        port = svc["web_port"]
        path = svc.get("web_path", "")
        port_str = "" if port == 80 else f":{port}"
        info["url"] = f"http://{lan_ip}{port_str}{path}"

    if "check_url" in svc:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(svc["check_url"])
                info["status"] = "running" if resp.status_code < 500 else "error"
        except Exception:
            info["status"] = "stopped"
    elif "systemd_units" in svc:
        all_active = all(_check_systemd_unit(u) for u in svc["systemd_units"])
        info["status"] = "running" if all_active else "stopped"
    elif "check_port" in svc:
        info["status"] = "running" if _check_port(svc["check_port"]) else "stopped"

    return info


def _get_zfs_pools() -> list[dict]:
    """Query ZFS pool status via zpool commands."""
    pools = []
    try:
        result = subprocess.run(
            ["zpool", "list", "-Hp", "-o", "name,size,alloc,free,capacity,health,fragmentation"],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return []

        for line in result.stdout.strip().splitlines():
            parts = line.split("\t")
            if len(parts) < 6:
                continue
            name = parts[0]
            total = int(parts[1])
            used = int(parts[2])
            free = int(parts[3])
            cap_pct = int(parts[4])
            health = parts[5]
            frag = parts[6].rstrip("%") if len(parts) > 6 and parts[6] != "-" else "0"

            pools.append({
                "name": name,
                "total": total,
                "used": used,
                "free": free,
                "capacity_pct": cap_pct,
                "health": health,
                "fragmentation_pct": int(frag),
            })
    except FileNotFoundError:
        return []
    except Exception:
        return []

    # Get scrub status per pool
    for pool in pools:
        try:
            result = subprocess.run(
                ["zpool", "status", pool["name"]],
                capture_output=True, text=True, timeout=10,
            )
            output = result.stdout
            if "scrub in progress" in output:
                pool["scrub_status"] = "in_progress"
            elif "scrub repaired" in output:
                for line in output.splitlines():
                    if "scan:" in line and "scrub repaired" in line:
                        pool["scrub_status"] = line.strip().removeprefix("scan: ")
                        break
            else:
                pool["scrub_status"] = "none"

            # Check for errors
            pool["errors"] = "none"
            for line in output.splitlines():
                if line.strip().startswith("errors:"):
                    pool["errors"] = line.strip().removeprefix("errors: ")
                    break
        except Exception:
            pool["scrub_status"] = "unknown"
            pool["errors"] = "unknown"

    return pools


@router.get("/{computer_id}/zfs")
def get_zfs_status(computer_id: str):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")
    return _get_zfs_pools()


@router.get("/{computer_id}/services")
async def list_services(computer_id: str):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")

    results = await asyncio.gather(*[_check_service(s) for s in _SERVICES])
    return results


@router.get("/{computer_id}/services/rustdesk/config")
async def get_rustdesk_config(computer_id: str):
    """Return the RustDesk server config needed by clients."""
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")

    key_path = "/opt/rustdesk/id_ed25519.pub"
    public_key = ""
    if os.path.isfile(key_path):
        with open(key_path) as f:
            public_key = f.read().strip()

    lan_ip = _get_lan_ip()

    return {
        "relay_server": lan_ip,
        "id_server": lan_ip,
        "api_server": "",
        "public_key": public_key,
    }


# ---------------------------------------------------------------------------
# Task endpoints
# ---------------------------------------------------------------------------

class Av1TaskRequest(BaseModel):
    folder: str
    recursive: bool = True
    preset: int = 4
    crf: int = 28
    threads: Optional[int] = None
    max_files: Optional[int] = None


@router.get("/{computer_id}/tasks")
def list_tasks(computer_id: str, db: Session = Depends(_get_tasks_db)):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")
    rows = (
        db.query(TaskRun)
        .filter(TaskRun.computer_id == computer_id)
        .order_by(TaskRun.created_at.desc())
        .limit(50)
        .all()
    )
    return [r.to_json() for r in rows]


@router.post("/{computer_id}/tasks/av1", status_code=201)
def start_av1_task(computer_id: str, body: Av1TaskRequest, request: Request, db: Session = Depends(_get_tasks_db)):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")

    folder = body.folder
    if not os.path.isdir(folder):
        raise HTTPException(400, f"Folder does not exist: {folder}")

    active = (
        db.query(TaskRun)
        .filter(TaskRun.computer_id == computer_id, TaskRun.task_type == "av1_convert",
                TaskRun.status.in_(["pending", "running"]))
        .first()
    )
    if active:
        raise HTTPException(409, f"An AV1 task is already running (id={active.id})")

    manifest = task_runner.scan_folder(folder, recursive=body.recursive)
    if not manifest:
        raise HTTPException(400, "No convertible video files found in the folder")

    if body.max_files and body.max_files > 0:
        manifest = manifest[:body.max_files]

    config = {
        "folder": folder,
        "recursive": body.recursive,
        "preset": body.preset,
        "crf": body.crf,
    }
    if body.threads:
        config["threads"] = body.threads
    if body.max_files:
        config["max_files"] = body.max_files

    task = TaskRun(
        computer_id=computer_id,
        task_type="av1_convert",
        status="pending",
        config=config,
        manifest=manifest,
        files_total=len(manifest),
        files_done=0,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    session_factory = request.app.state.TasksSessionLocal
    task_runner.start_av1_task(task.id, session_factory)

    return task.to_json()


@router.get("/{computer_id}/tasks/{task_id}")
def get_task(computer_id: str, task_id: int, db: Session = Depends(_get_tasks_db)):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")
    task = db.get(TaskRun, task_id)
    if not task or task.computer_id != computer_id:
        raise HTTPException(404, "Task not found")
    return task.to_json()


@router.delete("/{computer_id}/tasks/{task_id}")
def cancel_task(computer_id: str, task_id: int, db: Session = Depends(_get_tasks_db)):
    if computer_id != "local":
        raise HTTPException(404, "Computer not found")
    task = db.get(TaskRun, task_id)
    if not task or task.computer_id != computer_id:
        raise HTTPException(404, "Task not found")
    if task.status not in ("pending", "running"):
        raise HTTPException(400, "Task is not active")

    cancelled = task_runner.cancel(task_id)
    if not cancelled and task.status == "pending":
        task.status = "cancelled"
        task.completed_at = datetime.now(timezone.utc)
        db.commit()

    return {"status": "cancellation requested"}
