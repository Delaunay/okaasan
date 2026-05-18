"""Import Trakt.tv JSON dumps into the database.

User-wins policy: rows with source="manual" are never touched.
Only source="trakt_import" rows are upserted/replaced on re-import.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from .models import Media, WatchHistory, WatchlistItem, UserRating, Collection, CollectionItem
from .trakt_parser import TraktData
from .posters import PosterStore

log = logging.getLogger("okaasan.shows.importer")

_poster_store: PosterStore | None = None
_tmdb_client = None  # optional TMDBClient for poster fallback


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _get_or_create_media(db: Session, media_type: str, source: dict) -> Media:
    """Find or create a Media row keyed by (media_type, trakt_id)."""
    ids = source.get("ids", {})
    trakt_id = ids.get("trakt")
    tmdb_id = ids.get("tmdb")

    if trakt_id:
        existing = db.query(Media).filter_by(media_type=media_type, trakt_id=trakt_id).first()
        if existing:
            _maybe_fetch_poster(existing, source)
            return existing

    media = Media(
        media_type=media_type,
        title=source.get("title", "Unknown"),
        year=source.get("year"),
        slug=ids.get("slug"),
        trakt_id=trakt_id,
        tmdb_id=tmdb_id,
        imdb_id=ids.get("imdb"),
        tvdb_id=ids.get("tvdb"),
        genres=source.get("genres"),
        country=source.get("country"),
        runtime=source.get("runtime"),
        status=source.get("status"),
        overview=source.get("overview"),
    )
    db.add(media)
    db.flush()

    poster_path = _maybe_fetch_poster(media, source)
    if poster_path:
        media.poster_path = poster_path

    return media


def _maybe_fetch_poster(media: Media, source: dict) -> str | None:
    """Download poster from Trakt images or TMDB if not already on disk."""
    if _poster_store is None:
        return None
    if _poster_store.has_poster(media.media_type, media.trakt_id, media.tmdb_id):
        if not media.poster_path:
            media.poster_path = _poster_store.get_path(media.media_type, media.trakt_id, media.tmdb_id)
        return media.poster_path

    # Try Trakt images first
    images = source.get("images", {})
    posters = images.get("poster", [])
    if posters:
        path = _poster_store.save_from_trakt(
            media.media_type, media.trakt_id or 0, posters[0], media.tmdb_id
        )
        if path:
            media.poster_path = path
            return path

    # Fall back to TMDB
    if _tmdb_client and _tmdb_client.available and media.tmdb_id:
        try:
            if media.media_type == "show":
                info = _tmdb_client.get_show(media.tmdb_id)
            else:
                info = _tmdb_client.get_movie(media.tmdb_id)
            if info and info.get("poster_path"):
                path = _poster_store.save_from_tmdb(
                    media.media_type, media.tmdb_id, info["poster_path"], media.trakt_id
                )
                if path:
                    media.poster_path = path
                    return path
        except Exception as e:
            log.debug("TMDB poster fetch failed for %s %s: %s", media.media_type, media.tmdb_id, e)

    return None


def _import_watched_shows(db: Session, trakt: TraktData):
    """Import watched shows and their per-episode history."""
    log.info("Importing watched shows...")
    count = 0
    for item in trakt.watched_shows:
        show = item.get("show", {})
        media = _get_or_create_media(db, "show", show)

        for season in item.get("seasons", []):
            season_num = season.get("number")
            for ep in season.get("episodes", []):
                ep_num = ep.get("number")
                watched_at = _parse_dt(ep.get("last_watched_at"))
                if not watched_at:
                    continue

                exists = db.query(WatchHistory).filter_by(
                    media_id=media.id,
                    watched_at=watched_at,
                    season=season_num,
                    episode=ep_num,
                    source="trakt_import",
                ).first()
                if not exists:
                    db.add(WatchHistory(
                        media_id=media.id,
                        watched_at=watched_at,
                        season=season_num,
                        episode=ep_num,
                        source="trakt_import",
                    ))
                    count += 1

    log.info("Imported %d watch history entries for shows", count)


def _import_watched_movies(db: Session, trakt: TraktData):
    """Import watched movies."""
    log.info("Importing watched movies...")
    count = 0
    for item in trakt.watched_movies:
        movie = item.get("movie", {})
        media = _get_or_create_media(db, "movie", movie)

        watched_at = _parse_dt(item.get("last_watched_at"))
        if not watched_at:
            continue

        exists = db.query(WatchHistory).filter_by(
            media_id=media.id,
            watched_at=watched_at,
            season=None,
            episode=None,
            source="trakt_import",
        ).first()
        if not exists:
            db.add(WatchHistory(
                media_id=media.id,
                watched_at=watched_at,
                source="trakt_import",
            ))
            count += 1

    log.info("Imported %d watch history entries for movies", count)


def _import_watchlist(db: Session, trakt: TraktData):
    """Import watchlist items. Skips media already on watchlist with source=manual."""
    log.info("Importing watchlist...")

    db.query(WatchlistItem).filter_by(source="trakt_import").delete()
    db.flush()

    count = 0
    for item in trakt.watchlist:
        item_type = item.get("type", "show")
        source_obj = item.get("show") or item.get("movie") or {}
        media_type = "show" if item_type in ("show", "episode") else "movie"
        media = _get_or_create_media(db, media_type, source_obj)

        manual_exists = db.query(WatchlistItem).filter_by(
            media_id=media.id, source="manual"
        ).first()
        if manual_exists:
            continue

        db.add(WatchlistItem(
            media_id=media.id,
            rank=item.get("rank"),
            listed_at=_parse_dt(item.get("listed_at")),
            notes=item.get("notes"),
            source="trakt_import",
        ))
        count += 1

    log.info("Imported %d watchlist items", count)


def _import_ratings(db: Session, trakt: TraktData):
    """Import ratings. Skips media already rated with source=manual."""
    log.info("Importing ratings...")

    db.query(UserRating).filter_by(source="trakt_import").delete()
    db.flush()

    count = 0
    for item in trakt.ratings_shows:
        show = item.get("show", {})
        media = _get_or_create_media(db, "show", show)

        manual_exists = db.query(UserRating).filter_by(
            media_id=media.id, source="manual"
        ).first()
        if manual_exists:
            continue

        db.add(UserRating(
            media_id=media.id,
            rating=item.get("rating", 0),
            rated_at=_parse_dt(item.get("rated_at")),
            source="trakt_import",
        ))
        count += 1

    for item in trakt.ratings_movies:
        movie = item.get("movie", {})
        media = _get_or_create_media(db, "movie", movie)

        manual_exists = db.query(UserRating).filter_by(
            media_id=media.id, source="manual"
        ).first()
        if manual_exists:
            continue

        db.add(UserRating(
            media_id=media.id,
            rating=item.get("rating", 0),
            rated_at=_parse_dt(item.get("rated_at")),
            source="trakt_import",
        ))
        count += 1

    log.info("Imported %d ratings", count)


def _import_favorites(db: Session, trakt: TraktData):
    """Import favorites as a special collection."""
    log.info("Importing favorites collection...")

    coll = db.query(Collection).filter_by(collection_type="favorites").first()
    if not coll:
        coll = Collection(name="Favorites", collection_type="favorites")
        db.add(coll)
        db.flush()
    else:
        db.query(CollectionItem).filter_by(collection_id=coll.id).delete()
        db.flush()

    count = 0
    for idx, item in enumerate(trakt.favorites):
        item_type = item.get("type", "show")
        source_obj = item.get("show") or item.get("movie") or {}
        media_type = "show" if item_type in ("show", "episode") else "movie"
        media = _get_or_create_media(db, media_type, source_obj)

        db.add(CollectionItem(
            collection_id=coll.id,
            media_id=media.id,
            rank=idx,
        ))
        count += 1

    log.info("Imported %d favorites", count)


def _import_trakt_collection(db: Session, trakt: TraktData):
    """Import 'owned media' Trakt collection as a special collection."""
    log.info("Importing Trakt owned-media collection...")

    coll = db.query(Collection).filter_by(collection_type="trakt_owned").first()
    if not coll:
        coll = Collection(name="My Collection", collection_type="trakt_owned")
        db.add(coll)
        db.flush()
    else:
        db.query(CollectionItem).filter_by(collection_id=coll.id).delete()
        db.flush()

    count = 0
    for idx, item in enumerate(trakt.collection_shows):
        show = item.get("show", {})
        media = _get_or_create_media(db, "show", show)
        db.add(CollectionItem(
            collection_id=coll.id,
            media_id=media.id,
            rank=idx,
        ))
        count += 1

    for idx2, item in enumerate(trakt.collection_movies):
        movie = item.get("movie", {})
        media = _get_or_create_media(db, "movie", movie)
        db.add(CollectionItem(
            collection_id=coll.id,
            media_id=media.id,
            rank=count + idx2,
        ))
        count += 1

    log.info("Imported %d items into owned-media collection", count)


def import_trakt_data(db: Session, shows_dir: Path, base_dir: Path | None = None, tmdb_client=None):
    """Main entry point: import all Trakt dump data into the database.

    Safe to re-run. Only affects source="trakt_import" rows.
    User collections (collection_type="user") are never touched.

    Args:
        base_dir: the STATIC_FOLDER root for poster storage. If None, posters won't be fetched.
        tmdb_client: optional TMDBClient instance for poster fallback.
    """
    global _poster_store, _tmdb_client
    log.info("Starting Trakt data import from %s", shows_dir)

    _tmdb_client = tmdb_client

    if base_dir:
        _poster_store = PosterStore(base_dir)
    else:
        _poster_store = None

    trakt = TraktData(shows_dir)

    _import_watched_shows(db, trakt)
    _import_watched_movies(db, trakt)
    _import_watchlist(db, trakt)
    _import_ratings(db, trakt)
    _import_favorites(db, trakt)
    _import_trakt_collection(db, trakt)

    db.commit()
    log.info("Trakt import complete.")
