"""Manage the qbittorrent-nox process lifecycle."""
from __future__ import annotations

import asyncio
import base64
import configparser
import hashlib
import logging
import os
import shutil
import signal
from pathlib import Path

from ...paths import private_folder, logs_folder
from ...task_registry import registry

log = logging.getLogger("okaasan.qbittorrent.process")

_proc: asyncio.subprocess.Process | None = None

_QB_CONFIG_DIR = Path.home() / ".config" / "qBittorrent"
_QB_CONFIG_FILE = _QB_CONFIG_DIR / "qBittorrent.conf"

_PID_FILE_NAME = "qbittorrent-nox.pid"


def _pid_path() -> Path:
    return private_folder() / _PID_FILE_NAME


def _discover_pid() -> int | None:
    """Find a running qbittorrent-nox via /proc and adopt it into the pid file."""
    proc_dir = Path("/proc")
    if not proc_dir.is_dir():
        return None
    for entry in proc_dir.iterdir():
        if not entry.name.isdigit():
            continue
        try:
            cmdline = (entry / "cmdline").read_bytes()
            if b"qbittorrent-nox" in cmdline:
                pid = int(entry.name)
                _write_pid(pid)
                log.info("Adopted existing qbittorrent-nox process (pid %d)", pid)
                return pid
        except (OSError, ValueError):
            continue
    return None


def _read_pid() -> int | None:
    """Read PID from the pid file and verify the process is alive.
    Falls back to process discovery if no pid file exists."""
    p = _pid_path()
    if not p.is_file():
        return _discover_pid()
    try:
        pid = int(p.read_text().strip())
        os.kill(pid, 0)
        return pid
    except (ValueError, OSError):
        p.unlink(missing_ok=True)
        return None


def _write_pid(pid: int) -> None:
    p = _pid_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(str(pid))


def _clear_pid() -> None:
    _pid_path().unlink(missing_ok=True)


def _find_binary(custom_path: str | None = None) -> str:
    """Locate qbittorrent-nox binary."""
    if custom_path:
        if os.path.isfile(custom_path):
            return custom_path
        raise RuntimeError(
            f"Custom qbittorrent-nox path does not exist: {custom_path}"
        )
    path = shutil.which("qbittorrent-nox")
    if path:
        return path
    raise RuntimeError(
        "qbittorrent-nox not found on PATH. "
        "Install it with: sudo apt install qbittorrent-nox"
    )


def _pbkdf2_hash(password: str) -> str:
    """Generate a PBKDF2-SHA512 hash in qBittorrent's config format."""
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha512", password.encode(), salt, 100_000, dklen=64)
    b64_salt = base64.b64encode(salt).decode()
    b64_hash = base64.b64encode(dk).decode()
    return f"@ByteArray({b64_salt}:{b64_hash})"


def _preconfigure(port: int, username: str, password: str) -> None:
    """Write port + credentials into qBittorrent.conf before first start."""
    _QB_CONFIG_DIR.mkdir(parents=True, exist_ok=True)

    cfg = configparser.ConfigParser()
    cfg.optionxform = str  # preserve case
    if _QB_CONFIG_FILE.is_file():
        cfg.read(str(_QB_CONFIG_FILE))

    if "Preferences" not in cfg:
        cfg["Preferences"] = {}

    cfg["Preferences"]["WebUI\\Port"] = str(port)
    cfg["Preferences"]["WebUI\\Username"] = username
    cfg["Preferences"]["WebUI\\Password_PBKDF2"] = f'"{_pbkdf2_hash(password)}"'

    with open(_QB_CONFIG_FILE, "w") as f:
        cfg.write(f, space_around_delimiters=False)

    log.info("Pre-configured qBittorrent: port=%d, user=%s", port, username)


def is_running() -> bool:
    """Check whether qbittorrent-nox is currently running."""
    global _proc
    if _proc is not None:
        if _proc.returncode is None:
            return True
        _proc = None
        _clear_pid()
    return _read_pid() is not None


async def start(
    custom_path: str | None = None,
    webui_port: int = 8082,
    username: str = "admin",
    password: str = "adminadmin",
) -> int:
    """Start qbittorrent-nox. Returns the PID."""
    global _proc
    existing = _read_pid()
    if existing is not None:
        log.info("qbittorrent-nox already running (pid %d)", existing)
        registry.register("qbittorrent", "qBittorrent", status="running")
        return existing

    binary = _find_binary(custom_path)
    _preconfigure(webui_port, username, password)

    cmd = [binary, f"--webui-port={webui_port}"]
    log.info("Starting qbittorrent-nox: %s", " ".join(cmd))

    logs = logs_folder()
    stdout_path = logs / "qbittorrent-stdout.log"
    stderr_path = logs / "qbittorrent-stderr.log"
    stdout_f = open(stdout_path, "a")
    stderr_f = open(stderr_path, "a")

    try:
        _proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=stdout_f,
            stderr=stderr_f,
        )
    except PermissionError:
        stdout_f.close()
        stderr_f.close()
        raise RuntimeError(f"Permission denied running {binary}")
    except OSError as e:
        stdout_f.close()
        stderr_f.close()
        raise RuntimeError(f"Failed to execute {binary}: {e}")

    log.info("Logs → %s, %s", stdout_path, stderr_path)

    pid = _proc.pid
    _write_pid(pid)
    registry.register("qbittorrent", "qBittorrent", status="running")
    log.info("qbittorrent-nox started (pid %d)", pid)
    return pid


async def stop() -> bool:
    """Stop the qbittorrent-nox process. Returns True if it was running."""
    global _proc
    pid = _read_pid()
    if pid is None:
        return False

    log.info("Stopping qbittorrent-nox (pid %d)", pid)
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass

    for _ in range(25):
        try:
            os.kill(pid, 0)
            await asyncio.sleep(0.2)
        except OSError:
            break
    else:
        log.warning("qbittorrent-nox did not exit in time, sending SIGKILL")
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass

    _proc = None
    _clear_pid()
    registry.unregister("qbittorrent")
    return True


def status() -> dict:
    """Return current process status info."""
    pid = _read_pid()
    return {
        "running": pid is not None,
        "pid": pid,
        "binary": shutil.which("qbittorrent-nox"),
    }
