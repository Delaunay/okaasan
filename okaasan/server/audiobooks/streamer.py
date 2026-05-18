"""Audio streaming with direct serving and ffmpeg transcoding."""
from __future__ import annotations

import logging
import os
import signal
import subprocess
import weakref

from fastapi.responses import StreamingResponse, FileResponse
from starlette.responses import Response

log = logging.getLogger("okaasan.audiobooks.streamer")

TRANSCODE_FORMAT = "mp3"
TRANSCODE_ACODEC = "libmp3lame"
CHUNK_SIZE = 64 * 1024

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


def _cleanup_process(proc: subprocess.Popen) -> None:
    """Close stdout and kill the ffmpeg process."""
    try:
        proc.stdout.close()
    except OSError:
        pass
    _kill_process(proc)


class _BackgroundKill:
    """Starlette background task that kills ffmpeg on response finish/disconnect."""

    def __init__(self, proc: subprocess.Popen):
        self.proc = proc

    async def __call__(self) -> None:
        _cleanup_process(self.proc)


class TranscodeStreamer:
    """Transcode non-browser-native formats to MP3 via ffmpeg."""

    def stream(self, file_path: str, range_header: str | None = None) -> Response:
        cmd = [
            "ffmpeg",
            "-nostdin",
            "-i", file_path,
            "-c:a", TRANSCODE_ACODEC,
            "-b:a", "192k",
            "-f", TRANSCODE_FORMAT,
            "pipe:1",
        ]

        log.info("Transcoding audio: %s", os.path.basename(file_path))

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
            media_type="audio/mpeg",
            headers={
                "Accept-Ranges": "none",
                "Content-Disposition": f'inline; filename="{os.path.basename(file_path)}.mp3"',
            },
            background=_BackgroundKill(process),
        )


class DirectStreamer:
    """Serve browser-compatible audio files directly with range support."""

    def stream(self, file_path: str, range_header: str | None = None) -> Response:
        file_size = os.path.getsize(file_path)
        ext = file_path.rsplit(".", 1)[-1].lower()
        content_type = {
            "mp3": "audio/mpeg",
            "m4a": "audio/mp4",
            "m4b": "audio/mp4",
            "ogg": "audio/ogg",
            "flac": "audio/flac",
        }.get(ext, "audio/mpeg")

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


# Formats that browsers can play directly
_DIRECT_PLAYABLE = {"mp3", "m4a", "m4b", "ogg"}


def get_streamer(file_path: str) -> DirectStreamer | TranscodeStreamer:
    """Select the appropriate streamer based on file format."""
    ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
    if ext in _DIRECT_PLAYABLE:
        return DirectStreamer()
    return TranscodeStreamer()
