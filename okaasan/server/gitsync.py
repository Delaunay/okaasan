"""Background git auto-save: commit and push data changes."""
from __future__ import annotations

import asyncio
import logging
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

log = logging.getLogger("okaasan.gitsync")

_pending: asyncio.Event | None = None
_task: asyncio.Task | None = None
_data_dir: Path | None = None
_last_sync: SyncResult | None = None

SSH_KEY_DIR = Path.home() / ".ssh"
SSH_KEY_NAME = "okaasan_ed25519"


@dataclass
class SyncResult:
    commit: str | None = None
    pushed: bool = False
    push_error: str | None = None
    error: str | None = None
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "commit": self.commit,
            "pushed": self.pushed,
            "push_error": self.push_error,
            "error": self.error,
            "timestamp": self.timestamp,
        }


def _run(cmd: list[str], cwd: Path, env: dict | None = None) -> tuple[int, str]:
    import os
    run_env = dict(os.environ)
    if env:
        run_env.update(env)
    r = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=30, env=run_env)
    return r.returncode, (r.stdout + r.stderr).strip()


def is_git_repo(data_dir: Path) -> bool:
    return (data_dir / ".git").is_dir()


def get_ssh_key_path() -> Path:
    return SSH_KEY_DIR / SSH_KEY_NAME


def get_ssh_public_key() -> str | None:
    pub = SSH_KEY_DIR / f"{SSH_KEY_NAME}.pub"
    if pub.is_file():
        return pub.read_text().strip()
    return None


def generate_ssh_key() -> str:
    """Generate an ed25519 SSH key pair for Recipes. Returns the public key."""
    SSH_KEY_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    key_path = SSH_KEY_DIR / SSH_KEY_NAME

    if key_path.exists():
        key_path.unlink()
    pub = SSH_KEY_DIR / f"{SSH_KEY_NAME}.pub"
    if pub.exists():
        pub.unlink()

    subprocess.run(
        ["ssh-keygen", "-t", "ed25519", "-f", str(key_path),
         "-N", "", "-C", "okaasan-backup"],
        capture_output=True, text=True, check=True,
    )
    log.info("Generated SSH key at %s", key_path)

    _write_ssh_config(key_path)

    return pub.read_text().strip()


def _write_ssh_config(key_path: Path):
    """Ensure ~/.ssh/config has a Host entry using this key for github.com."""
    config_path = SSH_KEY_DIR / "config"
    marker = "# okaasan-managed"
    block = (
        f"\n{marker}\n"
        f"Host github.com-okaasan\n"
        f"  HostName github.com\n"
        f"  User git\n"
        f"  IdentityFile {key_path}\n"
        f"  IdentitiesOnly yes\n"
    )

    if config_path.is_file():
        content = config_path.read_text()
        if marker in content:
            lines = content.split("\n")
            new_lines = []
            skip = False
            for line in lines:
                if line.strip() == marker:
                    skip = True
                    continue
                if skip and (line.startswith("Host ") or line.strip() == ""):
                    if line.startswith("Host "):
                        continue
                    skip = False
                if skip and line.startswith("  "):
                    continue
                skip = False
                new_lines.append(line)
            content = "\n".join(new_lines)
        content += block
    else:
        content = block

    config_path.write_text(content)
    config_path.chmod(0o600)


def _rewrite_remote_for_ssh_alias(remote: str) -> str:
    """Rewrite git@github.com:... to use our SSH alias host."""
    if remote.startswith("git@github.com:"):
        return remote.replace("git@github.com:", "git@github.com-okaasan:", 1)
    return remote


def _current_branch(data_dir: Path) -> str:
    """Return the current branch name, defaulting to 'main'."""
    rc, out = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"], data_dir)
    return out if rc == 0 and out else "main"


def get_remote(data_dir: Path) -> str | None:
    if not is_git_repo(data_dir):
        return None
    rc, out = _run(["git", "remote", "get-url", "origin"], data_dir)
    if rc == 0 and out:
        return out.replace("github.com-okaasan", "github.com")
    return None


def get_status(data_dir: Path) -> dict:
    """Return full git status for the UI."""
    has_key = get_ssh_public_key() is not None
    repo = is_git_repo(data_dir)
    remote = get_remote(data_dir) if repo else None

    result = {
        "initialized": repo,
        "remote": remote,
        "ssh_key_exists": has_key,
        "ssh_public_key": get_ssh_public_key() or "",
    }

    if repo:
        rc, out = _run(["git", "log", "--oneline", "-5"], data_dir)
        result["recent_commits"] = out.split("\n") if rc == 0 and out else []
        rc, out = _run(["git", "status", "--porcelain"], data_dir)
        result["dirty"] = bool(out) if rc == 0 else False
    else:
        result["recent_commits"] = []
        result["dirty"] = False

    if _last_sync is not None:
        result["last_sync"] = _last_sync.to_dict()

    return result


def git_init(data_dir: Path, remote: str | None = None):
    """Initialise a git repo in data_dir, optionally add a remote."""
    data_dir.mkdir(parents=True, exist_ok=True)

    if not is_git_repo(data_dir):
        _run(["git", "init"], data_dir)
        _run(["git", "checkout", "-b", "main"], data_dir)
        log.info("Initialised git repo in %s", data_dir)

    gitignore = data_dir / ".gitignore"
    if not gitignore.exists():
        gitignore.write_text("# Recipes data\n")

    if remote:
        aliased = _rewrite_remote_for_ssh_alias(remote)
        rc, out = _run(["git", "remote", "get-url", "origin"], data_dir)
        if rc != 0:
            _run(["git", "remote", "add", "origin", aliased], data_dir)
            log.info("Added remote origin %s", remote)
        elif aliased not in out:
            _run(["git", "remote", "set-url", "origin", aliased], data_dir)
            log.info("Updated remote origin to %s", remote)


def _has_unpushed(data_dir: Path) -> bool:
    """Check if there are local commits not yet pushed to the remote."""
    branch = _current_branch(data_dir)
    rc, out = _run(["git", "rev-list", f"origin/{branch}..HEAD", "--count"], data_dir)
    if rc == 0:
        return out.strip() != "0"
    # If there's no upstream tracking yet, any commit is unpushed
    rc, _ = _run(["git", "rev-parse", "HEAD"], data_dir)
    return rc == 0


def git_sync(data_dir: Path) -> SyncResult:
    """Stage all, commit if dirty, push if remote exists."""
    global _last_sync

    if not is_git_repo(data_dir):
        result = SyncResult(error="Not a git repository")
        _last_sync = result
        return result

    rc, out = _run(["git", "add", "-A"], data_dir)
    if rc != 0:
        result = SyncResult(error=f"git add failed: {out}")
        _last_sync = result
        return result

    # Commit if there are staged changes
    committed = False
    rc, _ = _run(["git", "diff", "--cached", "--quiet"], data_dir)
    if rc != 0:
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        msg = f"auto-save {ts}"
        rc, out = _run(["git", "commit", "--author", "Okaasan Bot <okaasan@noreply>", "-m", msg], data_dir)
        if rc != 0:
            result = SyncResult(error=f"git commit failed: {out}")
            _last_sync = result
            return result
        committed = True

    rc, sha = _run(["git", "rev-parse", "--short", "HEAD"], data_dir)
    commit = sha if (rc == 0 and committed) else None
    result = SyncResult(commit=commit)

    # Push if there's a remote and we have unpushed commits
    rc, out = _run(["git", "remote", "get-url", "origin"], data_dir)
    if rc == 0 and out and (committed or _has_unpushed(data_dir)):
        branch = _current_branch(data_dir)
        rc, push_out = _run(["git", "push", "-u", "origin", branch], data_dir)
        if rc != 0:
            log.warning("git push failed: %s", push_out)
            result.push_error = push_out
        else:
            log.info("Pushed to %s", branch)
            result.pushed = True

    _last_sync = result
    return result


def get_last_sync() -> SyncResult | None:
    return _last_sync


async def _sync_loop(data_dir: Path, debounce_s: float = 5.0):
    """Background loop: waits for a write signal, debounces, then syncs."""
    global _pending, _last_sync
    assert _pending is not None

    while True:
        await _pending.wait()
        _pending.clear()
        await asyncio.sleep(debounce_s)

        if _pending.is_set():
            _pending.clear()

        try:
            result = await asyncio.get_event_loop().run_in_executor(
                None, git_sync, data_dir
            )
            if result.commit:
                log.info("Committed %s", result.commit)
            if result.push_error:
                log.warning("Push failed: %s", result.push_error)
            if result.error:
                log.error("Sync error: %s", result.error)
        except Exception as exc:
            log.exception("git sync failed")
            _last_sync = SyncResult(error=str(exc))


def notify_write():
    """Signal that a write happened; the background loop will debounce and sync."""
    if _pending is not None:
        _pending.set()


def start_sync(data_dir: Path, debounce_s: float = 5.0):
    """Start the background sync task. Call once at app startup."""
    global _pending, _task, _data_dir
    _data_dir = data_dir

    if not is_git_repo(data_dir):
        log.info("Data dir is not a git repo — auto-save disabled")
        return

    _pending = asyncio.Event()
    _task = asyncio.create_task(_sync_loop(data_dir, debounce_s))
    log.info("Git auto-save started (debounce=%ss)", debounce_s)


def ensure_sync_running(data_dir: Path, debounce_s: float = 5.0):
    """(Re)start sync if it's not already running. Used after setup-git from UI."""
    global _pending, _task, _data_dir
    _data_dir = data_dir

    if _task is not None and not _task.done():
        return

    if not is_git_repo(data_dir):
        return

    _pending = asyncio.Event()
    _task = asyncio.create_task(_sync_loop(data_dir, debounce_s))
    log.info("Git auto-save (re)started")
