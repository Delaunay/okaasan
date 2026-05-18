"""Music library: scan local folders, read tags, match files to DB entries."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from .library_models import MusicFile
from .models import MusicTrack
from ..paths import private_folder, public_folder, cache_folder
from ..scanner import BaseLibraryScanner

log = logging.getLogger("okaasan.music.library")

DEFAULT_EXTENSIONS = {"mp3", "flac", "ogg", "opus", "m4a", "wma", "wav", "aac"}

try:
    import mutagen
    from mutagen.easyid3 import EasyID3
    from mutagen.flac import FLAC
    from mutagen.mp3 import MP3
    from mutagen.oggvorbis import OggVorbis
    from mutagen.oggopus import OggOpus
    from mutagen.mp4 import MP4
    _HAS_MUTAGEN = True
except ImportError:
    _HAS_MUTAGEN = False
    log.warning("mutagen not installed — music tag reading disabled")


def _config_path(static_folder: str) -> Path:
    return private_folder() / "_music.json"


def load_config(static_folder: str) -> dict[str, Any]:
    path = _config_path(static_folder)
    if path.is_file():
        try:
            return json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "folders": [],
        "scan_interval_minutes": 60,
        "extensions": list(DEFAULT_EXTENSIONS),
        "metadata_enabled": False,
        "fetch_covers": True,
        "contact_email": "",
    }


def save_config(static_folder: str, config: dict[str, Any]):
    path = _config_path(static_folder)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2))


def _read_tags(file_path: str) -> dict[str, Any]:
    """Read audio metadata tags using mutagen. Returns a dict of tag values."""
    if not _HAS_MUTAGEN:
        return {}

    result: dict[str, Any] = {
        "title": None,
        "artist": None,
        "album": None,
        "album_artist": None,
        "track_number": None,
        "disc_number": None,
        "duration_ms": None,
        "genre": None,
        "year": None,
        "bitrate": None,
        "embedded_cover": None,
    }

    try:
        audio = mutagen.File(file_path)
        if audio is None:
            return result

        result["duration_ms"] = int(audio.info.length * 1000) if hasattr(audio.info, "length") else None
        if hasattr(audio.info, "bitrate"):
            result["bitrate"] = audio.info.bitrate

        if isinstance(audio, MP3):
            tags = audio.tags
            if tags:
                result["title"] = _id3_text(tags, "TIT2")
                result["artist"] = _id3_text(tags, "TPE1")
                result["album"] = _id3_text(tags, "TALB")
                result["album_artist"] = _id3_text(tags, "TPE2")
                result["genre"] = _id3_text(tags, "TCON")
                result["track_number"] = _id3_track(tags, "TRCK")
                result["disc_number"] = _id3_track(tags, "TPOS")
                result["year"] = _id3_year(tags)
                for key in tags:
                    if key.startswith("APIC"):
                        result["embedded_cover"] = tags[key].data
                        break

        elif isinstance(audio, FLAC):
            result["title"] = _vorbis_first(audio, "title")
            result["artist"] = _vorbis_first(audio, "artist")
            result["album"] = _vorbis_first(audio, "album")
            result["album_artist"] = _vorbis_first(audio, "albumartist")
            result["genre"] = _vorbis_first(audio, "genre")
            result["track_number"] = _vorbis_int(audio, "tracknumber")
            result["disc_number"] = _vorbis_int(audio, "discnumber")
            result["year"] = _vorbis_int(audio, "date")
            if audio.pictures:
                result["embedded_cover"] = audio.pictures[0].data

        elif isinstance(audio, (OggVorbis, OggOpus)):
            result["title"] = _vorbis_first(audio, "title")
            result["artist"] = _vorbis_first(audio, "artist")
            result["album"] = _vorbis_first(audio, "album")
            result["album_artist"] = _vorbis_first(audio, "albumartist")
            result["genre"] = _vorbis_first(audio, "genre")
            result["track_number"] = _vorbis_int(audio, "tracknumber")
            result["disc_number"] = _vorbis_int(audio, "discnumber")
            result["year"] = _vorbis_int(audio, "date")

        elif isinstance(audio, MP4):
            result["title"] = _mp4_first(audio, "\xa9nam")
            result["artist"] = _mp4_first(audio, "\xa9ART")
            result["album"] = _mp4_first(audio, "\xa9alb")
            result["album_artist"] = _mp4_first(audio, "aART")
            result["genre"] = _mp4_first(audio, "\xa9gen")
            result["year"] = _mp4_year(audio)
            trkn = audio.tags.get("trkn") if audio.tags else None
            if trkn:
                result["track_number"] = trkn[0][0]
            disk = audio.tags.get("disk") if audio.tags else None
            if disk:
                result["disc_number"] = disk[0][0]
            covr = audio.tags.get("covr") if audio.tags else None
            if covr:
                result["embedded_cover"] = bytes(covr[0])

        else:
            # Fallback: try EasyID3-style generic access
            for key, field in [("title", "title"), ("artist", "artist"),
                               ("album", "album"), ("genre", "genre")]:
                val = audio.get(key)
                if val:
                    result[field] = str(val[0]) if isinstance(val, list) else str(val)

    except Exception as e:
        log.debug("Failed to read tags from %s: %s", file_path, e)

    return result


def _id3_text(tags, key: str) -> str | None:
    frame = tags.get(key)
    if frame and frame.text:
        return str(frame.text[0])
    return None


def _id3_track(tags, key: str) -> int | None:
    frame = tags.get(key)
    if frame and frame.text:
        val = str(frame.text[0]).split("/")[0]
        try:
            return int(val)
        except ValueError:
            pass
    return None


def _id3_year(tags) -> int | None:
    for key in ("TDRC", "TYER", "TDAT"):
        frame = tags.get(key)
        if frame and frame.text:
            val = str(frame.text[0])[:4]
            try:
                return int(val)
            except ValueError:
                pass
    return None


def _vorbis_first(audio, key: str) -> str | None:
    val = audio.get(key)
    if val:
        return str(val[0])
    return None


def _vorbis_int(audio, key: str) -> int | None:
    val = _vorbis_first(audio, key)
    if val:
        try:
            return int(val.split("/")[0][:4])
        except ValueError:
            pass
    return None


def _mp4_first(audio, key: str) -> str | None:
    if not audio.tags:
        return None
    val = audio.tags.get(key)
    if val:
        return str(val[0])
    return None


def _mp4_year(audio) -> int | None:
    val = _mp4_first(audio, "\xa9day")
    if val:
        try:
            return int(val[:4])
        except ValueError:
            pass
    return None


def _save_embedded_cover(cover_data: bytes, artist: str | None, album: str | None, covers_dir: Path) -> str | None:
    """Save embedded cover art to disk. Returns relative path."""
    if not cover_data:
        return None
    import hashlib
    digest = hashlib.md5(cover_data).hexdigest()[:12]
    safe_name = f"{digest}.jpg"
    out_path = covers_dir / safe_name
    if not out_path.exists():
        out_path.write_bytes(cover_data)
    return str(out_path)


def _match_to_db(db: Session, title: str | None, artist: str | None) -> tuple[int | None, bool]:
    """Try to match a file's tags to a music_tracks record. Returns (track_id, matched)."""
    if not title:
        return None, False

    q = db.query(MusicTrack).filter(MusicTrack.title.ilike(title))
    if artist:
        q = q.filter(MusicTrack.artist.ilike(artist))
    track = q.first()
    if track:
        return track.id, True

    return None, False


def _get_mb_client(static_folder: str, config: dict[str, Any]):
    """Create a MusicBrainzClient if metadata is enabled."""
    if not config.get("metadata_enabled"):
        return None
    from .metadata import MusicBrainzClient
    client = MusicBrainzClient(
        cache_folder() / "music" / "mb",
        public_folder() / "data" / "music" / "covers",
    )
    contact = config.get("contact_email", "")
    if contact:
        client._http.headers["User-Agent"] = f"Okaasan/1.0 ({contact})"
    return client


def _enrich_with_musicbrainz(
    mb_client, title: str, artist: str | None, album: str | None,
    covers_dir: Path, fetch_covers: bool
) -> dict[str, Any]:
    """Query MusicBrainz for metadata enrichment. Returns extra fields to merge."""
    extra: dict[str, Any] = {}
    result = mb_client.search_recording(title, artist)
    if not result or not result.get("recordings"):
        return extra

    rec = result["recordings"][0]
    score = rec.get("score", 0)
    if score < 80:
        return extra

    extra["musicbrainz_id"] = rec.get("id")

    releases = rec.get("releases", [])
    if releases:
        release = releases[0]
        release_mbid = release.get("id")
        if not album:
            extra["album"] = release.get("title")
        if release.get("date"):
            try:
                extra["year"] = int(release["date"][:4])
            except (ValueError, TypeError):
                pass
        if fetch_covers and release_mbid:
            cover = mb_client.get_cover_art(release_mbid)
            if cover:
                extra["cover_path"] = cover

    artist_credits = rec.get("artist-credit", [])
    if artist_credits and not artist:
        extra["artist"] = artist_credits[0].get("name")

    return extra


def _to_relative_cover(path: str | None, static_folder: str) -> str | None:
    """Convert an absolute cover path to a relative path suitable for URL serving."""
    if not path:
        return None
    sf = str(static_folder).rstrip("/") + "/"
    if path.startswith(sf):
        return path[len(sf):]
    # Already relative
    if path.startswith("uploads/"):
        return path
    return path


def scan_folders(static_folder: str, private_engine, main_engine):
    """Scan configured folders and upsert music files into private DB."""
    config = load_config(static_folder)
    extensions = set(config.get("extensions", DEFAULT_EXTENSIONS))
    folders = config.get("folders", [])
    fetch_covers = config.get("fetch_covers", True)

    covers_dir = public_folder() / "data" / "music" / "covers"
    covers_dir.mkdir(parents=True, exist_ok=True)

    mb_client = _get_mb_client(static_folder, config)

    PrivateSession = sessionmaker(bind=private_engine)
    MainSession = sessionmaker(bind=main_engine)

    private_db = PrivateSession()
    main_db = MainSession()

    try:
        total_found = 0
        total_matched = 0
        total_new = 0

        for folder_path in folders:
            if not os.path.isdir(folder_path):
                log.warning("Music library folder not found: %s", folder_path)
                continue

            for root, _dirs, files in os.walk(folder_path):
                for fname in files:
                    ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                    if ext not in extensions:
                        continue

                    full_path = os.path.join(root, fname)
                    total_found += 1

                    existing = private_db.query(MusicFile).filter_by(file_path=full_path).first()
                    if existing:
                        existing.last_scanned = datetime.now(timezone.utc)
                        continue

                    tags = _read_tags(full_path)
                    title = tags.get("title")
                    artist = tags.get("artist")
                    album = tags.get("album")
                    track_number = tags.get("track_number")

                    # Fallback: parse title and track number from filename
                    # Common patterns: "01 - Song Title.mp3", "01. Song Title.mp3"
                    if not title:
                        stem = Path(fname).stem
                        import re
                        m = re.match(r"^(\d{1,3})[\s.\-_]+(.+)$", stem)
                        if m:
                            if not track_number:
                                track_number = int(m.group(1))
                            title = m.group(2).strip()
                        else:
                            title = stem

                    # Fallback: infer artist/album from folder structure
                    # Common patterns: /Library/Artist/Album/track.mp3
                    #                  /Library/Artist/track.mp3
                    if not artist or not album:
                        rel = os.path.relpath(full_path, folder_path)
                        parts = Path(rel).parts[:-1]  # directories only
                        if len(parts) >= 2:
                            if not artist:
                                artist = parts[-2]
                            if not album:
                                album = parts[-1]
                        elif len(parts) == 1:
                            if not artist:
                                artist = parts[0]

                    cover_path = None
                    if tags.get("embedded_cover"):
                        cover_path = _save_embedded_cover(
                            tags["embedded_cover"], artist, album, covers_dir
                        )

                    mb_extra: dict[str, Any] = {}
                    if mb_client and title:
                        mb_extra = _enrich_with_musicbrainz(
                            mb_client, title, artist, album, covers_dir, fetch_covers
                        )
                        if mb_extra.get("cover_path") and not cover_path:
                            cover_path = mb_extra["cover_path"]
                        if mb_extra.get("artist") and not artist:
                            artist = mb_extra["artist"]
                        if mb_extra.get("album") and not album:
                            album = mb_extra["album"]

                    cover_path = _to_relative_cover(cover_path, static_folder)

                    track_id, matched = _match_to_db(main_db, title, artist)
                    if not matched and title:
                        track = MusicTrack(
                            title=title,
                            artist=artist,
                            album=album,
                            album_artist=tags.get("album_artist") or artist,
                            track_number=track_number,
                            disc_number=tags.get("disc_number"),
                            duration_ms=tags.get("duration_ms"),
                            genre=mb_extra.get("genre") or tags.get("genre"),
                            year=mb_extra.get("year") or tags.get("year"),
                            cover_path=cover_path,
                            musicbrainz_id=mb_extra.get("musicbrainz_id"),
                        )
                        main_db.add(track)
                        main_db.flush()
                        track_id = track.id
                        matched = True

                    if matched:
                        total_matched += 1

                    mf = MusicFile(
                        track_id=track_id,
                        file_path=full_path,
                        file_size=os.path.getsize(full_path),
                        container=ext,
                        bitrate=tags.get("bitrate"),
                        duration_ms=tags.get("duration_ms"),
                        title=title,
                        artist=artist,
                        album=album,
                        last_scanned=datetime.now(timezone.utc),
                        matched=matched,
                    )
                    private_db.add(mf)
                    total_new += 1

        private_db.commit()
        main_db.commit()
        log.info("Music library scan complete: %d files found, %d new, %d matched", total_found, total_new, total_matched)
        return {"files_found": total_found, "new_files": total_new, "matched": total_matched}

    except Exception as e:
        private_db.rollback()
        main_db.rollback()
        log.error("Music library scan failed: %s", e)
        raise
    finally:
        private_db.close()
        main_db.close()


class MusicLibraryScanner(BaseLibraryScanner):
    """Background scanner that periodically crawls music folders."""

    _log_name = "music"

    def _load_config(self) -> dict[str, Any]:
        return load_config(self.static_folder)

    def _get_folders(self, config: dict) -> list[str]:
        return config.get("folders", [])

    def _get_extensions(self, config: dict) -> set[str] | None:
        return set(config.get("extensions", DEFAULT_EXTENSIONS))

    def _do_scan(self) -> dict:
        return scan_folders(self.static_folder, self.private_engine, self.main_engine)
