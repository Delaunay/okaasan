"""API routes for computer management and background tasks."""
from __future__ import annotations

import logging
import os
import platform
import subprocess
from datetime import datetime, timezone
from typing import Optional

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
