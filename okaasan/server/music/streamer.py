"""Music streaming — delegates to the unified VLC streamer."""
from __future__ import annotations

from starlette.responses import Response

from ..vlc_streamer import stream_audio


def get_audio_streamer(file_path: str) -> "_VLCAudioProxy":
    return _VLCAudioProxy()


class _VLCAudioProxy:
    """Thin adapter preserving the .stream() interface for existing call sites."""

    def stream(self, file_path: str, range_header: str | None = None) -> Response:
        return stream_audio(file_path, range_header)
