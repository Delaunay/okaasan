"""Handle completed torrent events — insert catalog + library file records."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session, sessionmaker

from .models import CompletedDownload

log = logging.getLogger("okaasan.qbittorrent.catalog")

# Category name → (media_type for the file record, module to use)
CATEGORY_MAP = {
    "tv": "show",
    "movie": "movie",
    "anime": "anime",
    "music": "music",
}


def _parse_size(raw: str | int | None) -> int | None:
    if raw is None:
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


def _walk_media_files(content_path: str, extensions: set[str]) -> list[str]:
    """Return all media files under content_path (file or directory)."""
    p = Path(content_path)
    if p.is_file():
        ext = p.suffix.lstrip(".").lower()
        if ext in extensions:
            return [str(p)]
        return []
    if p.is_dir():
        results = []
        for root, _dirs, files in os.walk(p):
            for fname in files:
                ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                if ext in extensions:
                    results.append(os.path.join(root, fname))
        return results
    return []


def handle_completed(
    torrent_hash: str,
    name: str,
    category: str,
    save_path: str,
    content_path: str,
    size: str | int | None,
    private_engine,
    main_engine,
    static_folder: str,
) -> dict:
    """Process a completed torrent: insert library file + catalog records.

    Returns a summary dict.
    """
    PrivateSession = sessionmaker(bind=private_engine)
    MainSession = sessionmaker(bind=main_engine)

    private_db = PrivateSession()
    main_db = MainSession()

    try:
        existing = private_db.query(CompletedDownload).filter_by(
            torrent_hash=torrent_hash
        ).first()
        if existing:
            log.info("Torrent %s already processed, skipping", torrent_hash[:8])
            return {"status": "already_processed", "id": existing.id}

        media_type = CATEGORY_MAP.get(category, category)
        catalog_id = None
        files_added = 0

        if media_type in ("show", "movie", "anime"):
            catalog_id, files_added = _handle_video(
                main_db, private_db, content_path, media_type, static_folder
            )
        elif media_type == "music":
            catalog_id, files_added = _handle_music(
                main_db, private_db, content_path, static_folder
            )
        else:
            log.info("Unknown category %r for torrent %s, recording without catalog insert",
                     category, torrent_hash[:8])

        record = CompletedDownload(
            torrent_hash=torrent_hash,
            name=name,
            category=category,
            save_path=save_path,
            content_path=content_path,
            size=_parse_size(size),
            media_type=media_type,
            completed_at=datetime.now(timezone.utc),
            catalog_id=catalog_id,
        )
        private_db.add(record)
        private_db.commit()
        main_db.commit()

        log.info("Processed torrent %s (%s): %d files, catalog_id=%s",
                 torrent_hash[:8], name, files_added, catalog_id)
        return {
            "status": "ok",
            "media_type": media_type,
            "files_added": files_added,
            "catalog_id": catalog_id,
        }

    except Exception:
        private_db.rollback()
        main_db.rollback()
        raise
    finally:
        private_db.close()
        main_db.close()


VIDEO_EXTENSIONS = {"mkv", "mp4", "avi", "m4v", "ts", "webm", "mov"}
MUSIC_EXTENSIONS = {"mp3", "flac", "ogg", "opus", "m4a", "wma", "wav", "aac"}


def _handle_video(
    main_db: Session,
    private_db: Session,
    content_path: str,
    media_type: str,
    static_folder: str,
) -> tuple[int | None, int]:
    """Insert video files into shows library + catalog."""
    from ...shows.library import _parse_filename, _match_to_db
    from ...shows.library_models import MediaFile
    from ...shows.models import Media

    files = _walk_media_files(content_path, VIDEO_EXTENSIONS)
    if not files:
        return None, 0

    first_catalog_id = None
    count = 0

    for file_path in files:
        if private_db.query(MediaFile).filter_by(file_path=file_path).first():
            continue

        parsed = _parse_filename(file_path, media_type)
        if not parsed or parsed.get("title") == "__extra__":
            continue

        media_id, tmdb_id, matched = _match_to_db(main_db, parsed, media_type)

        if not matched:
            db_media_type = "show" if media_type in ("show", "anime") else "movie"
            media = Media(
                media_type=db_media_type,
                title=parsed["title"].title(),
                year=None,
            )
            main_db.add(media)
            main_db.flush()
            media_id = media.id
            matched = True

        ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
        mf = MediaFile(
            media_id=media_id,
            media_type=media_type,
            tmdb_id=tmdb_id,
            title=parsed["title"],
            season=parsed.get("season"),
            episode=parsed.get("episode"),
            file_path=file_path,
            file_size=os.path.getsize(file_path) if os.path.isfile(file_path) else None,
            container=ext,
            last_scanned=datetime.now(timezone.utc),
            matched=matched,
        )
        private_db.add(mf)
        count += 1

        if first_catalog_id is None and media_id:
            first_catalog_id = media_id

    return first_catalog_id, count


def _handle_music(
    main_db: Session,
    private_db: Session,
    content_path: str,
    static_folder: str,
) -> tuple[int | None, int]:
    """Insert music files into music library + catalog."""
    from ...music.library_models import MusicFile
    from ...music.models import MusicTrack

    files = _walk_media_files(content_path, MUSIC_EXTENSIONS)
    if not files:
        return None, 0

    first_catalog_id = None
    count = 0

    for file_path in files:
        if private_db.query(MusicFile).filter_by(file_path=file_path).first():
            continue

        title, artist, album = _extract_music_metadata(file_path)

        track_id = None
        matched = False
        if title:
            existing = main_db.query(MusicTrack).filter(
                MusicTrack.title.ilike(title)
            )
            if artist:
                existing = existing.filter(MusicTrack.artist.ilike(artist))
            existing = existing.first()
            if existing:
                track_id = existing.id
                matched = True

        if not matched and title:
            track = MusicTrack(
                title=title,
                artist=artist,
                album=album,
            )
            main_db.add(track)
            main_db.flush()
            track_id = track.id
            matched = True

        ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
        mf = MusicFile(
            track_id=track_id,
            file_path=file_path,
            file_size=os.path.getsize(file_path) if os.path.isfile(file_path) else None,
            container=ext,
            title=title,
            artist=artist,
            album=album,
            last_scanned=datetime.now(timezone.utc),
            matched=matched,
        )
        private_db.add(mf)
        count += 1

        if first_catalog_id is None and track_id:
            first_catalog_id = track_id

    return first_catalog_id, count


def _extract_music_metadata(file_path: str) -> tuple[str | None, str | None, str | None]:
    """Read basic music tags. Falls back to filename parsing."""
    title = artist = album = None

    try:
        from ...music.library import _read_tags
        tags = _read_tags(file_path)
        title = tags.get("title")
        artist = tags.get("artist")
        album = tags.get("album")
    except Exception:
        pass

    if not title:
        import re
        stem = Path(file_path).stem
        m = re.match(r"^(\d{1,3})[\s.\-_]+(.+)$", stem)
        title = m.group(2).strip() if m else stem

    if not artist:
        parts = Path(file_path).parts
        if len(parts) >= 3:
            artist = parts[-3]
        elif len(parts) >= 2:
            artist = parts[-2]

    return title, artist, album
