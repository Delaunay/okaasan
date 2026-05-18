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


# ═══════════════════════════════════════════════════════════════════════════════
# Kitsu / MAL XML import
# ═══════════════════════════════════════════════════════════════════════════════

_JIKAN_API = "https://api.jikan.moe/v4/anime"
_jikan_cache: dict[int, dict] = {}
_jikan_last_req: float = 0
_jikan_cache_loaded = False


def _jikan_cache_path() -> Path:
    from .models import Base  # just to trigger import side-effects if needed
    from ..paths import cache_folder
    return cache_folder() / "jikan_anime.json"


def _load_jikan_cache():
    """Load persistent Jikan cache from disk."""
    global _jikan_cache, _jikan_cache_loaded
    if _jikan_cache_loaded:
        return
    _jikan_cache_loaded = True
    path = _jikan_cache_path()
    if path.is_file():
        try:
            import json
            raw = json.loads(path.read_text())
            _jikan_cache.update({int(k): v for k, v in raw.items()})
            log.info("Loaded %d entries from Jikan disk cache", len(_jikan_cache))
        except Exception as e:
            log.debug("Failed to load Jikan cache: %s", e)


def _save_jikan_cache():
    """Persist Jikan cache to disk."""
    import json
    path = _jikan_cache_path()
    try:
        path.write_text(json.dumps(_jikan_cache, ensure_ascii=False))
    except Exception as e:
        log.debug("Failed to save Jikan cache: %s", e)


def _resolve_mal_id(mal_id: int) -> dict | None:
    """Resolve a MAL anime ID to metadata via Jikan (free, no auth). Results are disk-cached."""
    import time
    import httpx

    _load_jikan_cache()

    if mal_id in _jikan_cache:
        return _jikan_cache[mal_id] or None

    global _jikan_last_req
    elapsed = time.time() - _jikan_last_req
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)

    try:
        _jikan_last_req = time.time()
        resp = httpx.get(f"{_JIKAN_API}/{mal_id}", timeout=15)
        if resp.status_code == 429:
            time.sleep(3)
            _jikan_last_req = time.time()
            resp = httpx.get(f"{_JIKAN_API}/{mal_id}", timeout=15)
        if resp.status_code != 200:
            _jikan_cache[mal_id] = {}
            _save_jikan_cache()
            return None
        data = resp.json().get("data", {})
        _jikan_cache[mal_id] = data
        _save_jikan_cache()
        return data
    except Exception as e:
        log.debug("Jikan lookup failed for MAL ID %d: %s", mal_id, e)
        _jikan_cache[mal_id] = {}
        return None


def _get_or_create_media_from_mal(db: Session, mal_id: int, anime_data: dict | None) -> Media | None:
    """Find or create a Media row for an anime identified by MAL ID."""
    # Try to find by title match in existing DB
    if anime_data:
        title = anime_data.get("title_english") or anime_data.get("title") or ""
        if title:
            existing = db.query(Media).filter(
                Media.media_type == "show",
                Media.title.ilike(title),
            ).first()
            if existing:
                return existing

    # Try to find by title variants
    if anime_data:
        for t in (anime_data.get("title"), anime_data.get("title_english"), anime_data.get("title_japanese")):
            if t:
                existing = db.query(Media).filter(
                    Media.media_type == "show",
                    Media.title.ilike(t),
                ).first()
                if existing:
                    return existing

    if not anime_data:
        return None

    title = anime_data.get("title_english") or anime_data.get("title") or f"MAL-{mal_id}"
    year = anime_data.get("year")
    if not year and anime_data.get("aired", {}).get("from"):
        try:
            year = int(anime_data["aired"]["from"][:4])
        except (ValueError, TypeError):
            pass

    media = Media(
        media_type="show",
        title=title,
        year=year,
        status=anime_data.get("status"),
        overview=(anime_data.get("synopsis") or "")[:1000] if anime_data.get("synopsis") else None,
    )
    media._newly_created = True
    db.add(media)
    db.flush()
    log.info("Created anime from Kitsu/MAL import: %s (mal_id=%d)", title, mal_id)
    return media


def import_kitsu_data(db: Session, dumps_dir: Path):
    """Import anime data from Kitsu MAL-format XML export.

    Parses the XML, resolves MAL IDs via Jikan, and creates:
    - Media entries for each anime
    - WatchHistory for completed/watching anime
    - WatchlistItems for "Plan to Watch"
    - Sets user_status for dropped anime

    Safe to re-run. Only affects source="kitsu_import" rows.
    """
    import xml.etree.ElementTree as ET

    anime_file = dumps_dir / "kitsu-setepenre-anime.xml"
    if not anime_file.is_file():
        log.info("No Kitsu anime dump found at %s, skipping", anime_file)
        return

    log.info("Starting Kitsu anime import from %s", anime_file)
    tree = ET.parse(anime_file)
    root = tree.getroot()
    entries = root.findall("anime")
    log.info("Found %d anime entries in Kitsu dump", len(entries))

    # Clear previous kitsu_import data
    db.query(WatchHistory).filter_by(source="kitsu_import").delete()
    db.query(WatchlistItem).filter_by(source="kitsu_import").delete()
    db.commit()

    watch_count = 0
    watchlist_count = 0
    rating_count = 0
    created_count = 0

    for idx, entry in enumerate(entries):
        mal_id_str = entry.findtext("series_animedb_id", "")
        if not mal_id_str:
            continue
        mal_id = int(mal_id_str)

        status = entry.findtext("my_status", "").strip()
        watched_eps = int(entry.findtext("my_watched_episodes", "0") or 0)
        start_date = entry.findtext("my_start_date", "")
        finish_date = entry.findtext("my_finish_date", "")

        # Resolve MAL ID to anime metadata
        anime_data = _resolve_mal_id(mal_id)
        media = _get_or_create_media_from_mal(db, mal_id, anime_data)
        if not media:
            log.debug("Could not resolve MAL ID %d, skipping", mal_id)
            continue

        if getattr(media, "_newly_created", False):
            created_count += 1

        # Set user_status based on Kitsu status
        if status == "Dropped":
            media.user_status = "dropped"
        elif status == "Completed":
            media.user_status = "completed"
        elif status == "Watching":
            media.user_status = "watching"

        # Import watch history for completed/watching anime
        if status in ("Completed", "Watching") and watched_eps > 0:
            watched_at = None
            if finish_date:
                watched_at = _parse_dt(finish_date + "T00:00:00Z")
            elif start_date:
                watched_at = _parse_dt(start_date + "T00:00:00Z")
            else:
                watched_at = datetime.now(timezone.utc)

            for ep_num in range(1, watched_eps + 1):
                exists = db.query(WatchHistory).filter_by(
                    media_id=media.id,
                    season=1,
                    episode=ep_num,
                ).first()
                if not exists:
                    db.add(WatchHistory(
                        media_id=media.id,
                        watched_at=watched_at,
                        season=1,
                        episode=ep_num,
                        source="kitsu_import",
                    ))
                    watch_count += 1

        # Import Plan to Watch as watchlist
        elif status == "Plan to Watch":
            exists = db.query(WatchlistItem).filter_by(media_id=media.id).first()
            if not exists:
                db.add(WatchlistItem(
                    media_id=media.id,
                    listed_at=datetime.now(timezone.utc),
                    source="kitsu_import",
                ))
                watchlist_count += 1

        # Import rating if present
        score_str = entry.findtext("my_score", "")
        if score_str and score_str != "0":
            score = int(score_str)
            existing_rating = db.query(UserRating).filter_by(
                media_id=media.id, source="manual"
            ).first()
            if not existing_rating:
                db.query(UserRating).filter_by(
                    media_id=media.id, source="kitsu_import"
                ).delete()
                db.add(UserRating(
                    media_id=media.id,
                    rating=score,
                    rated_at=datetime.now(timezone.utc),
                    source="kitsu_import",
                ))
                rating_count += 1

        # Commit every 5 entries to release the DB write lock periodically
        if (idx + 1) % 5 == 0:
            db.commit()

    db.commit()
    log.info(
        "Kitsu import complete: %d watch entries, %d watchlist items, %d ratings, %d new media created",
        watch_count, watchlist_count, rating_count, created_count,
    )

    # Import favorites from Kitsu API
    _import_kitsu_favorites(db)


_KITSU_USER_ID = "136392"  # Setepenre on Kitsu


def _import_kitsu_favorites(db: Session):
    """Fetch favorites from the Kitsu API and add to the favorites collection."""
    import httpx

    log.info("Fetching Kitsu favorites...")
    try:
        resp = httpx.get(
            f"https://kitsu.io/api/edge/users/{_KITSU_USER_ID}/favorites",
            params={
                "include": "item",
                "fields[anime]": "titles,canonicalTitle,episodeCount,status,synopsis",
                "page[limit]": "20",
            },
            headers={"Accept": "application/vnd.api+json"},
            timeout=15,
        )
        if resp.status_code != 200:
            log.warning("Kitsu favorites fetch failed: HTTP %d", resp.status_code)
            return
    except Exception as e:
        log.warning("Kitsu favorites fetch failed: %s", e)
        return

    result = resp.json()
    data = result.get("data", [])
    included = result.get("included", [])

    if not data:
        log.info("No Kitsu favorites found")
        return

    # Build lookup of included anime
    inc_map = {}
    for inc in included:
        inc_map[f"{inc['type']}:{inc['id']}"] = inc

    # Get or create favorites collection
    coll = db.query(Collection).filter_by(collection_type="favorites").first()
    if not coll:
        coll = Collection(name="Favorites", collection_type="favorites")
        db.add(coll)
        db.flush()

    count = 0
    for fav in data:
        item_ref = fav["relationships"]["item"]["data"]
        key = f"{item_ref['type']}:{item_ref['id']}"
        inc = inc_map.get(key)
        if not inc or item_ref["type"] != "anime":
            continue

        attrs = inc.get("attributes", {})
        titles = attrs.get("titles", {})
        title = titles.get("en") or attrs.get("canonicalTitle", "")
        if not title:
            continue

        # Find or create the media entry
        existing = db.query(Media).filter(
            Media.media_type == "show",
            Media.title.ilike(title),
        ).first()

        if not existing:
            existing = Media(
                media_type="show",
                title=title,
                status=attrs.get("status"),
                overview=(attrs.get("synopsis") or "")[:1000] if attrs.get("synopsis") else None,
            )
            db.add(existing)
            db.flush()

        # Add to favorites if not already there
        already = db.query(CollectionItem).filter_by(
            collection_id=coll.id, media_id=existing.id
        ).first()
        if not already:
            rank = fav["attributes"].get("favRank", count)
            db.add(CollectionItem(
                collection_id=coll.id,
                media_id=existing.id,
                rank=rank,
            ))
            count += 1

    db.commit()
    log.info("Imported %d Kitsu favorites", count)


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
