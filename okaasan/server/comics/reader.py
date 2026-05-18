"""CBZ/CBR page extraction for the comic reader."""
from __future__ import annotations

import io
import logging
import os
import subprocess
import zipfile
from pathlib import Path

log = logging.getLogger("okaasan.comics.reader")

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}


def _is_image(name: str) -> bool:
    return Path(name).suffix.lower() in _IMAGE_EXTENSIONS


def _sorted_image_names(names: list[str]) -> list[str]:
    """Return image filenames sorted naturally (ignoring directory structure)."""
    images = [n for n in names if _is_image(n)]
    images.sort(key=lambda n: (Path(n).parent.as_posix(), Path(n).name))
    return images


def get_page_list(file_path: str) -> list[str]:
    """List all image filenames in the archive, sorted."""
    ext = Path(file_path).suffix.lower()

    if ext == ".cbz":
        return _cbz_page_list(file_path)
    elif ext == ".cbr":
        return _cbr_page_list(file_path)
    else:
        return []


def get_page_count(file_path: str) -> int:
    """Count the number of image pages in the archive."""
    return len(get_page_list(file_path))


def get_page(file_path: str, page_number: int) -> tuple[bytes, str] | None:
    """Extract a single page image. Returns (image_bytes, content_type) or None."""
    ext = Path(file_path).suffix.lower()

    if ext == ".cbz":
        return _cbz_get_page(file_path, page_number)
    elif ext == ".cbr":
        return _cbr_get_page(file_path, page_number)
    else:
        return None


# ── CBZ (ZIP) ──────────────────────────────────────────────────────

def _cbz_page_list(file_path: str) -> list[str]:
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            return _sorted_image_names(zf.namelist())
    except (zipfile.BadZipFile, OSError) as e:
        log.warning("Failed to read CBZ %s: %s", file_path, e)
        return []


def _cbz_get_page(file_path: str, page_number: int) -> tuple[bytes, str] | None:
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            pages = _sorted_image_names(zf.namelist())
            if page_number < 0 or page_number >= len(pages):
                return None
            name = pages[page_number]
            data = zf.read(name)
            ct = _content_type(name)
            return data, ct
    except (zipfile.BadZipFile, OSError, KeyError) as e:
        log.warning("Failed to extract page %d from CBZ %s: %s", page_number, file_path, e)
        return None


# ── CBR (RAR) ──────────────────────────────────────────────────────

def _cbr_page_list(file_path: str) -> list[str]:
    try:
        import rarfile
        with rarfile.RarFile(file_path, "r") as rf:
            return _sorted_image_names(rf.namelist())
    except ImportError:
        return _cbr_page_list_subprocess(file_path)
    except Exception as e:
        log.warning("Failed to read CBR %s with rarfile: %s", file_path, e)
        return _cbr_page_list_subprocess(file_path)


def _cbr_page_list_subprocess(file_path: str) -> list[str]:
    """Fallback: use unrar to list files."""
    try:
        result = subprocess.run(
            ["unrar", "lb", file_path],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            log.warning("unrar list failed for %s: %s", file_path, result.stderr)
            return []
        names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return _sorted_image_names(names)
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        log.warning("unrar not available or timed out for %s: %s", file_path, e)
        return []


def _cbr_get_page(file_path: str, page_number: int) -> tuple[bytes, str] | None:
    try:
        import rarfile
        with rarfile.RarFile(file_path, "r") as rf:
            pages = _sorted_image_names(rf.namelist())
            if page_number < 0 or page_number >= len(pages):
                return None
            name = pages[page_number]
            data = rf.read(name)
            return data, _content_type(name)
    except ImportError:
        return _cbr_get_page_subprocess(file_path, page_number)
    except Exception as e:
        log.warning("Failed to extract page %d from CBR %s: %s", page_number, file_path, e)
        return _cbr_get_page_subprocess(file_path, page_number)


def _cbr_get_page_subprocess(file_path: str, page_number: int) -> tuple[bytes, str] | None:
    """Fallback: use unrar to extract a specific page."""
    pages = _cbr_page_list_subprocess(file_path)
    if page_number < 0 or page_number >= len(pages):
        return None

    target = pages[page_number]
    try:
        result = subprocess.run(
            ["unrar", "p", "-inul", file_path, target],
            capture_output=True, timeout=30,
        )
        if result.returncode != 0:
            return None
        return result.stdout, _content_type(target)
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None


# ── Helpers ────────────────────────────────────────────────────────

def _content_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".bmp": "image/bmp",
    }.get(ext, "image/jpeg")
