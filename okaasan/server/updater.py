"""Background auto-updater: checks PyPI for new versions and upgrades in-place."""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import subprocess
import sys
from typing import AsyncIterator
from urllib.request import Request, urlopen

import okaasan

log = logging.getLogger("okaasan.updater")

PYPI_URL = "https://pypi.org/pypi/okaasan/json"

_latest_cache: dict = {"version": None, "ts": 0.0}
_CACHE_TTL = 300  # 5 minutes


def get_latest_version() -> str | None:
    import time
    now = time.monotonic()
    if _latest_cache["version"] and (now - _latest_cache["ts"]) < _CACHE_TTL:
        return _latest_cache["version"]
    try:
        req = Request(PYPI_URL, headers={
            "User-Agent": f"okaasan/{okaasan.__version__} (https://github.com/Delaunay/recipes)",
            "Accept": "application/json",
        })
        with urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        ver = data["info"]["version"]
        _latest_cache["version"] = ver
        _latest_cache["ts"] = now
        return ver
    except Exception:
        log.warning("Could not check PyPI for updates")
        return None


def _version_tuple(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in v.split("."))


def needs_update(latest: str) -> bool:
    try:
        return _version_tuple(latest) > _version_tuple(okaasan.__version__)
    except (ValueError, TypeError):
        return False


def _run(cmd: list[str], timeout: int = 120) -> tuple[bool, str]:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        output = (r.stdout + r.stderr).strip()
        return r.returncode == 0, output
    except subprocess.TimeoutExpired:
        return False, f"Command timed out after {timeout}s: {' '.join(cmd)}"
    except FileNotFoundError:
        return False, f"Command not found: {cmd[0]}"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def _upgrade_cmd() -> list[str]:
    python = sys.executable
    uv = shutil.which("uv")
    if uv:
        return [uv, "pip", "install", "--python", python, "--upgrade", "okaasan"]
    return [python, "-m", "pip", "install", "--upgrade", "okaasan"]


def _restart_cmds() -> list[list[str]]:
    return [
        ["sudo", "systemctl", "restart", "okaasan.service"],
        ["systemctl", "--user", "restart", "okaasan.service"],
    ]


def do_upgrade() -> tuple[bool, str]:
    """Install the latest version via uv (preferred) or pip fallback."""
    return _run(_upgrade_cmd(), timeout=120)


def restart_service() -> tuple[bool, str]:
    """Restart the systemd service (tries system-level, falls back to user-level)."""
    ok, out = _run(["sudo", "systemctl", "restart", "okaasan.service"], timeout=30)
    if ok:
        return True, out

    ok2, out2 = _run(
        ["systemctl", "--user", "restart", "okaasan.service"], timeout=30,
    )
    if ok2:
        return True, out2
    return False, f"system: {out}\nuser: {out2}"


# ── SSE streaming upgrade ────────────────────────────────────

def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


async def stream_upgrade() -> AsyncIterator[str]:
    """Run the full upgrade pipeline, yielding SSE events with live output."""
    current = okaasan.__version__

    yield _sse("log", f"Current version: {current}")
    yield _sse("log", "Installing latest version...")

    cmd = _upgrade_cmd()
    yield _sse("log", f"$ {' '.join(cmd)}")

    lines: list[str] = []
    ok = False
    async for event in _stream_subprocess(cmd):
        if isinstance(event, str):
            lines.append(event)
            yield _sse("log", event)
        else:
            ok = event

    if not ok:
        yield _sse("log", "ERROR: Upgrade failed")
        yield _sse("done", json.dumps({
            "status": "error", "message": "Upgrade failed", "output": "\n".join(lines),
        }))
        return

    yield _sse("log", "Upgrade successful. Restarting service...")

    for restart_cmd in _restart_cmds():
        yield _sse("log", f"$ {' '.join(restart_cmd)}")
        restart_lines: list[str] = []
        rok = False
        async for event in _stream_subprocess(restart_cmd, timeout=30):
            if isinstance(event, str):
                restart_lines.append(event)
                yield _sse("log", event)
            else:
                rok = event
        if rok:
            yield _sse("log", "Service restarted successfully.")
            yield _sse("done", json.dumps({
                "status": "updated", "from": current, "restarted": True,
            }))
            return

    yield _sse("log", "WARNING: Could not restart service automatically.")
    yield _sse("done", json.dumps({
        "status": "updated", "from": current, "restarted": False,
    }))


async def _stream_subprocess(
    cmd: list[str],
    timeout: int = 120,
) -> AsyncIterator[str | bool]:
    """Run a subprocess, yielding each output line as it arrives.

    Yields str for each line, then a final bool indicating success.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        assert proc.stdout is not None
        while True:
            try:
                raw = await asyncio.wait_for(proc.stdout.readline(), timeout=timeout)
            except asyncio.TimeoutError:
                proc.kill()
                yield f"Command timed out after {timeout}s"
                yield False
                return
            if not raw:
                break
            yield raw.decode("utf-8", errors="replace").rstrip()
        await proc.wait()
        yield proc.returncode == 0
    except FileNotFoundError:
        yield f"Command not found: {cmd[0]}"
        yield False
    except Exception as exc:
        yield f"{type(exc).__name__}: {exc}"
        yield False


# ── Legacy one-shot (used by background loop & CLI) ──────────

async def check_and_update() -> dict:
    """One-shot check + update. Returns status dict."""
    loop = asyncio.get_event_loop()
    latest = await loop.run_in_executor(None, get_latest_version)

    if latest is None:
        return {"status": "error", "message": "Could not reach PyPI"}

    if not needs_update(latest):
        return {
            "status": "up-to-date",
            "current": okaasan.__version__,
            "latest": latest,
        }

    log.info("Upgrading %s -> %s", okaasan.__version__, latest)
    ok, out = await loop.run_in_executor(None, do_upgrade)
    if not ok:
        return {"status": "error", "message": "Upgrade failed", "output": out}

    rok, rout = await loop.run_in_executor(None, restart_service)
    result = {
        "status": "updated",
        "from": okaasan.__version__,
        "to": latest,
        "restarted": rok,
    }
    if not rok:
        result["output"] = rout
    return result


async def _update_loop(interval_hours: float):
    interval_s = interval_hours * 3600
    while True:
        await asyncio.sleep(interval_s)
        try:
            result = await check_and_update()
            if result["status"] == "updated":
                log.info("Updated to %s, restarting...", result["to"])
            elif result["status"] == "error":
                log.warning("Update check: %s", result.get("message"))
        except Exception:
            log.exception("Update loop error")


_update_task: asyncio.Task | None = None


def start_update_loop(interval_hours: float = 24.0):
    global _update_task
    _update_task = asyncio.create_task(_update_loop(interval_hours))
    log.info("Auto-update loop started (check every %sh)", interval_hours)
