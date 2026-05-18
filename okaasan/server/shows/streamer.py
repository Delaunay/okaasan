"""Video streaming with pluggable backends (transcode via ffmpeg, direct file serving)."""
from __future__ import annotations

import logging
import os
import signal
import subprocess
import threading
import weakref
from abc import ABC, abstractmethod

from fastapi.responses import StreamingResponse, FileResponse
from starlette.responses import Response

log = logging.getLogger("okaasan.shows.streamer")

# Browser-compatible output format
TRANSCODE_FORMAT = "mp4"
TRANSCODE_VCODEC = "libx264"
TRANSCODE_ACODEC = "aac"
CHUNK_SIZE = 64 * 1024  # 64KB chunks

# Global registry of active ffmpeg processes so we can kill them on disconnect
_active_processes: weakref.WeakSet[subprocess.Popen] = weakref.WeakSet()


def _kill_process(proc: subprocess.Popen) -> None:
    """Ensure an ffmpeg process is fully dead."""
    if proc.poll() is not None:
        return
    log.info("Killing ffmpeg pid %d", proc.pid)
    try:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2)
    except OSError:
        pass


class Streamer(ABC):
    """Abstract base for video streaming strategies."""

    @abstractmethod
    def stream(self, file_path: str, range_header: str | None = None) -> Response:
        ...


class TranscodeStreamer(Streamer):
    """Transcode via ffmpeg to H264+AAC MP4 for universal browser support."""

    def stream(self, file_path: str, range_header: str | None = None) -> Response:
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-i", file_path,
            "-c:v", TRANSCODE_VCODEC,
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", TRANSCODE_ACODEC,
            "-b:a", "192k",
            "-movflags", "frag_keyframe+empty_moov+faststart",
            "-f", TRANSCODE_FORMAT,
            "-threads", "0",
            "pipe:1",
        ]

        if range_header:
            start_bytes = _parse_range_start(range_header)
            if start_bytes and start_bytes > 0:
                file_size = os.path.getsize(file_path)
                duration = _probe_duration(file_path)
                if duration:
                    offset_seconds = (start_bytes / file_size) * duration
                    cmd = [
                        "ffmpeg",
                        "-nostdin",
                        "-ss", str(int(offset_seconds)),
                        "-i", file_path,
                        "-c:v", TRANSCODE_VCODEC,
                        "-preset", "ultrafast",
                        "-crf", "23",
                        "-c:a", TRANSCODE_ACODEC,
                        "-b:a", "192k",
                        "-movflags", "frag_keyframe+empty_moov+faststart",
                        "-f", TRANSCODE_FORMAT,
                        "-threads", "0",
                        "pipe:1",
                    ]

        log.info("Transcoding: %s", os.path.basename(file_path))

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        _active_processes.add(process)

        async def generate():
            try:
                while True:
                    chunk = process.stdout.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk
            finally:
                _cleanup_process(process)

        return StreamingResponse(
            generate(),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "none",
                "Content-Disposition": f'inline; filename="{os.path.basename(file_path)}.mp4"',
            },
            background=_BackgroundKill(process),
        )


class _BackgroundKill:
    """Starlette background task that kills the ffmpeg process when the response finishes or the client disconnects."""

    def __init__(self, proc: subprocess.Popen):
        self.proc = proc

    async def __call__(self) -> None:
        _cleanup_process(self.proc)


def _cleanup_process(proc: subprocess.Popen) -> None:
    """Close stdout and kill the ffmpeg process."""
    try:
        proc.stdout.close()
    except OSError:
        pass
    _kill_process(proc)


class DirectStreamer(Streamer):
    """Serve the file directly with range request support (for browser-compatible formats)."""

    def stream(self, file_path: str, range_header: str | None = None) -> Response:
        file_size = os.path.getsize(file_path)
        ext = file_path.rsplit(".", 1)[-1].lower()
        content_type = {
            "mp4": "video/mp4",
            "webm": "video/webm",
            "m4v": "video/mp4",
            "mkv": "video/x-matroska",
        }.get(ext, "video/mp4")

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


def _parse_range(range_header: str, file_size: int) -> tuple[int, int]:
    """Parse Range header into (start, end) byte positions."""
    range_spec = range_header.replace("bytes=", "")
    parts = range_spec.split("-")
    start = int(parts[0]) if parts[0] else 0
    end = int(parts[1]) if parts[1] else file_size - 1
    end = min(end, file_size - 1)
    return start, end


def _parse_range_start(range_header: str) -> int | None:
    """Extract the start byte from a Range header."""
    try:
        range_spec = range_header.replace("bytes=", "")
        start = range_spec.split("-")[0]
        return int(start) if start else None
    except (ValueError, IndexError):
        return None


def _probe_duration(file_path: str) -> float | None:
    """Get video duration in seconds using ffprobe."""
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
    except (subprocess.TimeoutExpired, ValueError, OSError):
        pass
    return None


# Containers that browsers can usually play directly
_DIRECT_PLAYABLE = {"mp4", "m4v", "webm"}


def get_streamer(file_path: str) -> Streamer:
    """Select the appropriate streamer based on file format."""
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    if ext in _DIRECT_PLAYABLE:
        return DirectStreamer()
    return TranscodeStreamer()
