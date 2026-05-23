"""Background task runner for computer management tasks (AV1 conversion, etc.)."""
from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from sqlalchemy.orm import Session

from .models import TaskRun

log = logging.getLogger("okaasan.computers.tasks")

VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv",
    ".webm", ".m4v", ".ts", ".mpg", ".mpeg", ".3gp",
}

AV1_DEFAULTS = {
    "video_codec": "libsvtav1",
    "preset": "4",
    "crf": "28",
    "audio_codec": "libopus",
    "audio_bitrate": "128k",
}

MAX_LOG_LINES = 200

# Active task threads keyed by task_run id; value is an Event for cancellation.
_active: dict[int, threading.Event] = {}


def is_running(task_id: int) -> bool:
    return task_id in _active


def cancel(task_id: int) -> bool:
    ev = _active.get(task_id)
    if ev is None:
        return False
    ev.set()
    return True


def recover_orphaned_tasks(session_factory: Callable[[], Session]) -> None:
    """Mark any tasks stuck in running/pending (from a previous server lifecycle) as failed."""
    db = session_factory()
    try:
        orphans = (
            db.query(TaskRun)
            .filter(TaskRun.status.in_(["running", "pending"]))
            .all()
        )
        for task in orphans:
            task.status = "failed"
            task.error = "Server restarted while task was active"
            task.completed_at = datetime.now(timezone.utc)
            _append_log(task, "[system] Task aborted: server process restarted")
        if orphans:
            db.commit()
            log.info("Recovered %d orphaned task(s)", len(orphans))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Logging helper
# ---------------------------------------------------------------------------

def _append_log(task: TaskRun, line: str):
    """Append a timestamped line to the task's log, keeping the last MAX_LOG_LINES."""
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    entry = f"[{ts}] {line}"
    existing = task.logs or ""
    lines = existing.split("\n") if existing else []
    lines.append(entry)
    if len(lines) > MAX_LOG_LINES:
        lines = lines[-MAX_LOG_LINES:]
    task.logs = "\n".join(lines)


# ---------------------------------------------------------------------------
# ffprobe helpers
# ---------------------------------------------------------------------------

def _probe(filepath: Path) -> dict | None:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", str(filepath)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError) as e:
        log.debug("ffprobe failed for %s: %s", filepath, e)
        return None


def _is_already_av1(filepath: Path) -> bool:
    info = _probe(filepath)
    if not info:
        return False
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video":
            return stream.get("codec_name", "").lower() in ("av1", "libsvtav1", "libaom-av1")
    return False


def _get_fps(filepath: Path) -> float:
    info = _probe(filepath)
    if not info:
        return 24.0
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video":
            fps_str = stream.get("r_frame_rate", "24/1")
            try:
                num, den = fps_str.split("/")
                return float(num) / float(den)
            except (ValueError, ZeroDivisionError):
                return 24.0
    return 24.0


# ---------------------------------------------------------------------------
# Scan
# ---------------------------------------------------------------------------

def scan_folder(folder: str, recursive: bool = True) -> list[dict]:
    """Walk *folder* and return a manifest of convertible video files."""
    root = Path(folder)
    items: list[dict] = []
    iterator = sorted(root.rglob("*")) if recursive else sorted(root.iterdir())
    for p in iterator:
        if not p.is_file() or p.suffix.lower() not in VIDEO_EXTENSIONS:
            continue
        if _is_already_av1(p):
            continue
        items.append({
            "path": str(p),
            "size_before": p.stat().st_size,
            "size_after": None,
            "status": "pending",
            "saved": None,
            "duration_sec": None,
        })
    return items


# ---------------------------------------------------------------------------
# Transcode one file
# ---------------------------------------------------------------------------

def _build_ffmpeg_cmd(
    src: Path, dst: Path, preset: str, crf: str, gop: int,
    threads: int | None, *, copy_subs: bool = True,
) -> list[str]:
    """Build an ffmpeg command list with optional thread/CPU limiting."""
    cmd = ["ffmpeg", "-y"]
    if threads:
        cmd += ["-threads", str(threads)]
    cmd += [
        "-i", str(src),
        "-c:v", AV1_DEFAULTS["video_codec"],
        "-preset", preset,
        "-crf", crf,
        "-g", str(gop),
        "-keyint_min", str(gop),
        "-pix_fmt", "yuv420p10le",
    ]
    if threads:
        cmd += ["-svtav1-params", f"lp={threads}"]
    cmd += [
        "-c:a", AV1_DEFAULTS["audio_codec"],
        "-b:a", AV1_DEFAULTS["audio_bitrate"],
    ]
    if copy_subs:
        cmd += ["-c:s", "copy"]
    else:
        cmd += ["-sn"]
    cmd += ["-movflags", "+faststart", str(dst)]
    return cmd


def _transcode(
    src: Path, dst: Path, preset: str, crf: str,
    task: TaskRun, db: Session, threads: int | None = None,
) -> tuple[bool, str]:
    """Transcode *src* to AV1 using Popen for live stderr capture. Returns (success, error_msg)."""
    fps = _get_fps(src)
    gop = max(1, round(fps * 2))

    cmd = _build_ffmpeg_cmd(src, dst, preset, crf, gop, threads, copy_subs=True)
    ok, err = _run_ffmpeg(cmd, task, db)

    if not ok and ("subtitle" in err.lower() or "codec" in err.lower()):
        _append_log(task, "Retrying without subtitle copy...")
        db.commit()
        cmd_retry = _build_ffmpeg_cmd(src, dst, preset, crf, gop, threads, copy_subs=False)
        if dst.exists():
            dst.unlink()
        ok, err = _run_ffmpeg(cmd_retry, task, db)

    return ok, err


def _lowprio_preexec():
    """Preexec hook: lower CPU and I/O priority of the child process."""
    try:
        os.nice(15)
    except OSError:
        pass
    try:
        os.setpriority(os.PRIO_PROCESS, 0, 15)
    except (OSError, AttributeError):
        pass


def _run_ffmpeg(cmd: list[str], task: TaskRun, db: Session) -> tuple[bool, str]:
    """Run ffmpeg with Popen, streaming stderr into task logs."""
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True,
            preexec_fn=_lowprio_preexec,
        )
    except OSError as e:
        return False, f"Failed to start ffmpeg: {e}"

    last_log_time = time.monotonic()
    stderr_lines: list[str] = []

    try:
        for line in proc.stderr:
            line = line.rstrip()
            if not line:
                continue
            stderr_lines.append(line)
            # Only flush logs to DB every 5 seconds to avoid write spam
            now = time.monotonic()
            if now - last_log_time >= 5.0:
                _append_log(task, line)
                db.commit()
                last_log_time = now

        proc.wait(timeout=7200)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        return False, "transcode timed out (>2h)"

    if proc.returncode != 0:
        tail = "\n".join(stderr_lines[-10:])
        _append_log(task, f"ffmpeg exited with code {proc.returncode}")
        _append_log(task, tail[-300:])
        db.commit()
        return False, tail[-500:] if tail else f"ffmpeg exit code {proc.returncode}"

    _append_log(task, "ffmpeg completed successfully")
    db.commit()
    return True, ""


# ---------------------------------------------------------------------------
# Background runner
# ---------------------------------------------------------------------------

def start_av1_task(
    task_id: int,
    session_factory: Callable[[], Session],
) -> None:
    """Spawn a background thread that processes the AV1 conversion task."""
    cancel_event = threading.Event()
    _active[task_id] = cancel_event

    def _run():
        db = session_factory()
        try:
            _run_av1(task_id, db, cancel_event)
        except Exception as exc:
            log.exception("AV1 task %d crashed", task_id)
            try:
                task = db.get(TaskRun, task_id)
                if task and task.status == "running":
                    task.status = "failed"
                    task.error = str(exc)[:500]
                    _append_log(task, f"CRASH: {traceback.format_exc()[-500:]}")
                    task.completed_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                log.exception("Failed to mark task %d as failed", task_id)
        finally:
            _active.pop(task_id, None)
            db.close()

    t = threading.Thread(target=_run, name=f"av1-task-{task_id}", daemon=True)
    t.start()


def _run_av1(task_id: int, db: Session, cancel_event: threading.Event):
    task = db.get(TaskRun, task_id)
    if not task:
        return

    manifest: list[dict] = task.manifest or []
    task.status = "running"
    task.started_at = datetime.now(timezone.utc)
    _append_log(task, f"Starting AV1 conversion: {task.files_total} files")
    db.commit()

    config = task.config or {}
    preset = str(config.get("preset", AV1_DEFAULTS["preset"]))
    crf = str(config.get("crf", AV1_DEFAULTS["crf"]))
    threads: int | None = config.get("threads")
    settings_msg = f"Settings: preset={preset} crf={crf} codec={AV1_DEFAULTS['video_codec']}"
    if threads:
        settings_msg += f" threads={threads}"
    _append_log(task, settings_msg)
    db.commit()

    for i, entry in enumerate(manifest):
        if cancel_event.is_set():
            task.status = "cancelled"
            task.completed_at = datetime.now(timezone.utc)
            _append_log(task, "Task cancelled by user")
            db.commit()
            return

        src = Path(entry["path"])

        if not src.exists():
            entry["status"] = "skipped"
            entry["error"] = "file not found"
            _append_log(task, f"[{i+1}/{task.files_total}] SKIP (not found): {src.name}")
            _persist_progress(db, task, manifest, i)
            continue

        size_mb = entry["size_before"] / 1048576
        _append_log(task, f"[{i+1}/{task.files_total}] Converting: {src.name} ({size_mb:.1f} MB)")
        task.current_file = src.name
        db.commit()

        tmp = src.with_suffix(".av1_temp.mp4")

        try:
            start = time.monotonic()
            ok, err = _transcode(src, tmp, preset, crf, task, db, threads=threads)
            elapsed = time.monotonic() - start
        except Exception as exc:
            entry["status"] = "failed"
            entry["error"] = str(exc)[:200]
            _append_log(task, f"  ERROR: {exc}")
            if tmp.exists():
                tmp.unlink()
            _persist_progress(db, task, manifest, i)
            continue

        if not ok:
            entry["status"] = "failed"
            entry["error"] = err[:200]
            _append_log(task, f"  FAILED: {err[:150]}")
            if tmp.exists():
                tmp.unlink()
            _persist_progress(db, task, manifest, i)
            continue

        if not tmp.exists():
            entry["status"] = "failed"
            entry["error"] = "output file missing after transcode"
            _append_log(task, "  FAILED: output file missing")
            _persist_progress(db, task, manifest, i)
            continue

        new_size = tmp.stat().st_size

        # Sanity: output suspiciously tiny
        if new_size < 1024:
            entry["status"] = "failed"
            entry["error"] = f"output too small ({new_size} bytes)"
            _append_log(task, f"  FAILED: output too small ({new_size} bytes)")
            tmp.unlink()
            _persist_progress(db, task, manifest, i)
            continue

        # AV1 version larger -> keep original
        if new_size >= entry["size_before"]:
            entry["status"] = "skipped"
            entry["size_after"] = new_size
            entry["saved"] = 0
            new_mb = new_size / 1048576
            _append_log(task, f"  SKIP: AV1 larger ({new_mb:.1f} MB vs {size_mb:.1f} MB), keeping original")
            tmp.unlink()
            _persist_progress(db, task, manifest, i)
            continue

        # Success: replace original
        final = src.with_suffix(".mp4")
        try:
            src.unlink()
            tmp.rename(final)
        except OSError as e:
            entry["status"] = "failed"
            entry["error"] = f"file replace failed: {e}"
            _append_log(task, f"  FAILED: could not replace original: {e}")
            _persist_progress(db, task, manifest, i)
            continue

        saved = entry["size_before"] - new_size
        entry["status"] = "done"
        entry["size_after"] = new_size
        entry["saved"] = saved
        entry["duration_sec"] = round(elapsed, 1)
        entry["new_path"] = str(final)

        task.bytes_saved += saved
        saved_mb = saved / 1048576
        new_mb = new_size / 1048576
        _append_log(task, f"  OK: {size_mb:.1f} → {new_mb:.1f} MB (saved {saved_mb:.1f} MB) in {elapsed:.0f}s")
        _persist_progress(db, task, manifest, i)
        log.info("AV1: %s  %.1f → %.1f MB  (saved %.1f MB in %.0fs)", src.name, size_mb, new_mb, saved_mb, elapsed)

    # Summary
    done_count = sum(1 for e in manifest if e["status"] == "done")
    fail_count = sum(1 for e in manifest if e["status"] == "failed")
    skip_count = sum(1 for e in manifest if e["status"] == "skipped")
    total_saved_mb = task.bytes_saved / 1048576

    task.status = "completed"
    task.current_file = None
    task.completed_at = datetime.now(timezone.utc)
    task.manifest = list(manifest)
    _append_log(task, f"Completed: {done_count} converted, {fail_count} failed, {skip_count} skipped, {total_saved_mb:.1f} MB saved")
    db.commit()


def _persist_progress(db: Session, task: TaskRun, manifest: list[dict], idx: int):
    """Write current progress to DB after each file."""
    task.files_done = idx + 1
    task.manifest = list(manifest)
    db.commit()
