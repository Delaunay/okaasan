"""On-demand media remuxing, plus the shared building block for a future
library-wide background transcode job.

Remuxing (``ffmpeg -c copy``) repackages a file into a different container
without re-encoding video/audio — cheap, fast, and lossless. It fixes the
common "wrong container" playback failure (e.g. an MKV holding H.264/AAC
that Chrome refuses to play natively) without the cost of a full transcode,
and — unlike the VLC live-transcode fallback in vlc_streamer.py — the
result is a real seekable file servable with HTTP range requests.

``remux_to_mp4`` is deliberately a plain (src, dst) -> (ok, error) function
with no request/streaming concerns, so a future "pre-remux the whole
library" background job (mirroring computers/tasks.py's AV1 job: a
TaskRun-tracked loop over a file manifest, with progress/cancellation) can
call it directly instead of duplicating the ffmpeg invocation.
"""
from __future__ import annotations

import hashlib
import logging
import os
import subprocess

log = logging.getLogger("okaasan.media_transcode")

CACHE_SUBDIR = "remux"


def _lowprio_preexec():
    """Preexec hook: lower CPU/IO priority so a remux never competes with
    the request that triggered it (same idea as computers/tasks.py)."""
    try:
        os.nice(15)
    except OSError:
        pass
    try:
        os.setpriority(os.PRIO_PROCESS, 0, 15)
    except (OSError, AttributeError):
        pass


def remux_cache_path(cache_root: str, file_path: str) -> str:
    """Deterministic cache path for a remuxed copy of file_path, keyed by
    path + mtime so replacing/re-encoding the source invalidates the cache."""
    try:
        mtime = os.path.getmtime(file_path)
    except OSError:
        mtime = 0
    key = hashlib.sha1(f"{file_path}:{mtime}".encode()).hexdigest()
    cache_dir = os.path.join(cache_root, CACHE_SUBDIR)
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.join(cache_dir, f"{key}.mp4")


def remux_to_mp4(src_path: str, dst_path: str, *, timeout: int = 600) -> tuple[bool, str]:
    """Stream-copy src_path into an MP4 container at dst_path (no re-encode).

    Returns (success, error_message). Writes to a .part file first and
    renames on success so a killed/failed run never leaves a half-written
    file behind for the cache to pick up.
    """
    tmp_dst = dst_path + ".part"
    cmd = [
        "ffmpeg", "-y",
        "-i", src_path,
        "-c", "copy",
        "-movflags", "+faststart",
        tmp_dst,
    ]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
            preexec_fn=_lowprio_preexec,
        )
    except (subprocess.TimeoutExpired, OSError) as e:
        if os.path.exists(tmp_dst):
            os.unlink(tmp_dst)
        return False, str(e)

    if result.returncode != 0 or not os.path.exists(tmp_dst):
        if os.path.exists(tmp_dst):
            os.unlink(tmp_dst)
        return False, (result.stderr or "")[-500:]

    os.replace(tmp_dst, dst_path)
    return True, ""


def ensure_remuxed(cache_root: str, file_path: str) -> str | None:
    """Return a cached, stream-copied MP4 remux of file_path, running ffmpeg
    if it isn't already cached. Returns None if the remux itself failed
    (caller should fall back to a different playback mode).

    This calls remux_to_mp4, which blocks on the ffmpeg subprocess — call it
    from a worker thread (e.g. asyncio.to_thread) from an async route,
    never directly on the event loop.
    """
    dst = remux_cache_path(cache_root, file_path)
    if os.path.exists(dst):
        return dst

    log.info("Remuxing %s -> %s", os.path.basename(file_path), dst)
    ok, err = remux_to_mp4(file_path, dst)
    if not ok:
        log.warning("Remux failed for %s: %s", file_path, err)
        return None
    return dst
