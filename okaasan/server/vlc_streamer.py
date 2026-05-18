"""Unified VLC-based media streaming (audio & video).

Uses cvlc (VLC command-line) for transcoding, replacing ffmpeg.
Direct file serving with range support is also provided for browser-native formats.
Async subprocess I/O ensures client disconnect kills VLC immediately.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import signal
import subprocess

from fastapi.responses import FileResponse, StreamingResponse
from starlette.responses import Response

log = logging.getLogger("okaasan.streamer")

CHUNK_SIZE = 64 * 1024  # 64 KB

# Track async processes by pid for kill_all
_active_pids: set[int] = set()

_vlc_bin: str | None = None


def _find_vlc() -> str:
    """Locate cvlc binary, raise if not installed."""
    global _vlc_bin
    if _vlc_bin is None:
        for name in ("cvlc", "vlc"):
            path = shutil.which(name)
            if path:
                _vlc_bin = path
                break
        if _vlc_bin is None:
            raise RuntimeError("VLC (cvlc) not found on PATH")
    return _vlc_bin


def _kill_pid(pid: int) -> None:
    """Kill a process by pid using SIGTERM then SIGKILL."""
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return
    log.info("Killed VLC pid %d", pid)


async def _kill_async_proc(proc: asyncio.subprocess.Process) -> None:
    """Terminate an async subprocess cleanly."""
    if proc.returncode is not None:
        return
    pid = proc.pid
    log.info("Killing VLC pid %d", pid)
    try:
        proc.kill()
        await proc.wait()
    except (OSError, ProcessLookupError):
        pass
    _active_pids.discard(pid)


def kill_all() -> int:
    """Kill all tracked VLC processes. Returns count killed."""
    killed = 0
    for pid in list(_active_pids):
        try:
            os.kill(pid, signal.SIGKILL)
            killed += 1
            log.info("kill_all: killed VLC pid %d", pid)
        except OSError:
            pass
    _active_pids.clear()
    return killed


# ═══════════════════════════════════════════════════════════════════════════════
# Direct file serving (for browser-native formats)
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_range(range_header: str, file_size: int) -> tuple[int, int]:
    """Parse Range header → (start, end) byte offsets."""
    range_spec = range_header.replace("bytes=", "")
    parts = range_spec.split("-")
    start = int(parts[0]) if parts[0] else 0
    end = int(parts[1]) if parts[1] else file_size - 1
    return start, min(end, file_size - 1)


def direct_stream(file_path: str, range_header: str | None, content_type: str) -> Response:
    """Serve a file directly with HTTP range support."""
    file_size = os.path.getsize(file_path)

    if not range_header:
        return FileResponse(
            file_path,
            media_type=content_type,
            headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)},
        )

    start, end = _parse_range(range_header, file_size)

    def generate():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        generate(),
        status_code=206,
        media_type=content_type,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(end - start + 1),
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# VLC video transcoding → WebM (VP8 + Vorbis) to stdout
# ═══════════════════════════════════════════════════════════════════════════════

def _vlc_video_cmd(file_path: str, start_time: float = 0) -> list[str]:
    """Build cvlc command for video → WebM transcoding to stdout."""
    vlc = _find_vlc()
    cmd = [
        vlc, "--intf", "dummy", "--play-and-exit", "--no-repeat", "--no-loop",
    ]
    if start_time > 0:
        cmd += ["--start-time", str(start_time)]
    cmd += [
        file_path,
        "--sout",
        "#transcode{vcodec=VP80,vb=4000,scale=Auto,"
        "acodec=vorb,ab=192,channels=2,samplerate=44100}"
        ":std{access=file,mux=webm,dst=-}",
        "vlc://quit",
    ]
    return cmd


def vlc_video_stream(file_path: str, range_header: str | None = None) -> Response:
    """Transcode video to WebM via VLC and stream to the browser."""
    start_time = 0.0
    if range_header:
        start_bytes = _parse_range_start(range_header)
        if start_bytes and start_bytes > 0:
            file_size = os.path.getsize(file_path)
            duration = _probe_duration(file_path)
            if duration:
                start_time = (start_bytes / file_size) * duration

    cmd = _vlc_video_cmd(file_path, start_time)
    log.info("VLC video transcode: %s (start=%.1fs)", os.path.basename(file_path), start_time)

    async def generate():
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        _active_pids.add(proc.pid)
        try:
            while True:
                chunk = await proc.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
        finally:
            await _kill_async_proc(proc)

    return StreamingResponse(
        generate(),
        media_type="video/webm",
        headers={
            "Accept-Ranges": "none",
            "Cache-Control": "no-store, no-cache",
            "Content-Disposition": f'inline; filename="{os.path.basename(file_path)}.webm"',
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# VLC audio transcoding → MP3 to stdout
# ═══════════════════════════════════════════════════════════════════════════════

def _vlc_audio_cmd(file_path: str) -> list[str]:
    """Build cvlc command for audio → MP3 transcoding to stdout."""
    vlc = _find_vlc()
    return [
        vlc, "--intf", "dummy", "--play-and-exit", "--no-repeat", "--no-loop",
        "--no-video",
        file_path,
        "--sout",
        "#transcode{acodec=mp3,ab=192,channels=2,samplerate=44100}"
        ":std{access=file,mux=dummy,dst=-}",
        "vlc://quit",
    ]


def vlc_audio_stream(file_path: str, range_header: str | None = None) -> Response:
    """Transcode audio to MP3 via VLC and stream to the browser."""
    cmd = _vlc_audio_cmd(file_path)
    log.info("VLC audio transcode: %s", os.path.basename(file_path))

    async def generate():
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        _active_pids.add(proc.pid)
        try:
            while True:
                chunk = await proc.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
        finally:
            await _kill_async_proc(proc)

    return StreamingResponse(
        generate(),
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "none",
            "Cache-Control": "no-store, no-cache",
            "Content-Disposition": f'inline; filename="{os.path.basename(file_path)}.mp3"',
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Helper utilities
# ═══════════════════════════════════════════════════════════════════════════════

def _parse_range_start(range_header: str) -> int | None:
    """Extract the start byte from a Range header."""
    try:
        range_spec = range_header.replace("bytes=", "")
        start = range_spec.split("-")[0]
        return int(start) if start else None
    except (ValueError, IndexError):
        return None


def _probe_duration(file_path: str) -> float | None:
    """Get media duration in seconds using ffprobe (still used for seek estimation)."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except (subprocess.TimeoutExpired, ValueError, OSError, FileNotFoundError):
        pass
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# Content-type maps
# ═══════════════════════════════════════════════════════════════════════════════

VIDEO_CONTENT_TYPES: dict[str, str] = {
    "mp4": "video/mp4",
    "webm": "video/webm",
    "m4v": "video/mp4",
    "mkv": "video/x-matroska",
}

AUDIO_CONTENT_TYPES: dict[str, str] = {
    "mp3": "audio/mpeg",
    "m4a": "audio/mp4",
    "m4b": "audio/mp4",
    "aac": "audio/aac",
    "ogg": "audio/ogg",
    "opus": "audio/opus",
    "flac": "audio/flac",
}

# Formats that browsers can play directly (no transcoding needed)
DIRECT_VIDEO = {"mp4", "m4v", "webm"}
DIRECT_AUDIO = {"mp3", "m4a", "m4b", "aac", "ogg", "opus", "flac"}


# ═══════════════════════════════════════════════════════════════════════════════
# Public entry points
# ═══════════════════════════════════════════════════════════════════════════════

def stream_video(file_path: str, range_header: str | None = None) -> Response:
    """Stream a video file — direct if browser-native, VLC transcode otherwise."""
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    if ext in DIRECT_VIDEO:
        ct = VIDEO_CONTENT_TYPES.get(ext, "video/mp4")
        return direct_stream(file_path, range_header, ct)
    return vlc_video_stream(file_path, range_header)


def stream_audio(file_path: str, range_header: str | None = None) -> Response:
    """Stream an audio file — direct if browser-native, VLC transcode otherwise."""
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    if ext in DIRECT_AUDIO:
        ct = AUDIO_CONTENT_TYPES.get(ext, "audio/mpeg")
        return direct_stream(file_path, range_header, ct)
    return vlc_audio_stream(file_path, range_header)
