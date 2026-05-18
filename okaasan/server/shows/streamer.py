"""Video streaming — delegates to the unified VLC streamer."""
from __future__ import annotations

from starlette.responses import Response

from ..vlc_streamer import stream_video


def get_streamer(file_path: str) -> "_VLCVideoProxy":
    return _VLCVideoProxy()


class _VLCVideoProxy: 
    """Thin adapter preserving the .stream() interface for existing call sites."""

    def stream(self, file_path: str, range_header: str | None = None) -> Response:
        return stream_video(file_path, range_header)
