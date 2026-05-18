"""API routes for Shows & Movies section."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..decorators import expose
from .models import Media, WatchHistory, WatchlistItem, UserRating, Collection, CollectionItem
from .tmdb import TMDBClient
from .posters import PosterStore

log = logging.getLogger("okaasan.shows")

router = APIRouter(prefix="/shows", tags=["shows"])

_tmdb: TMDBClient | None = None
_posters: PosterStore | None = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


def _init_tmdb(static_folder: str) -> TMDBClient:
    import json as _json
    global _tmdb, _posters
    base = Path(static_folder)
    cache_dir = base / "uploads" / "data" / "shows" / "tmdb_cache"

    tmdb_key = None
    tmdb_bearer = None
    config_path = base / "private" / "_tmdb.json"
    if config_path.is_file():
        try:
            with open(config_path) as f:
                cfg = _json.load(f)
                tmdb_key = cfg.get("api_key")
                tmdb_bearer = cfg.get("bearer_token")
        except (ValueError, OSError):
            pass

    _tmdb = TMDBClient(cache_dir, api_key=tmdb_key, bearer_token=tmdb_bearer)
    _posters = PosterStore(base)
    return _tmdb


def _get_tmdb(request: Request) -> TMDBClient:
    global _tmdb
    if _tmdb is None:
        _init_tmdb(request.app.state.static_folder)
    return _tmdb


# ── Overview ────────────────────────────────────────────────────────

@router.get("/overview")
@expose()
def get_overview(request: Request, db: Session = Depends(_get_db)):
    """Overview: recently watched, watchlist next, summary stats."""
    recently_watched = (
        db.query(WatchHistory)
        .join(Media)
        .order_by(desc(WatchHistory.watched_at))
        .limit(12)
        .all()
    )

    seen_media: set[int] = set()
    unique_recent = []
    for wh in recently_watched:
        if wh.media_id not in seen_media:
            seen_media.add(wh.media_id)
            unique_recent.append({
                **wh.media.to_json(),
                "watched_at": wh.watched_at.isoformat() + "Z" if wh.watched_at else None,
                "season": wh.season,
                "episode": wh.episode,
            })

    watchlist_next = (
        db.query(WatchlistItem)
        .join(Media)
        .order_by(WatchlistItem.rank.asc().nulls_last())
        .limit(10)
        .all()
    )

    total_shows = db.query(Media).filter_by(media_type="show").count()
    total_movies = db.query(Media).filter_by(media_type="movie").count()
    total_history = db.query(WatchHistory).count()

    return {
        "recently_watched": unique_recent,
        "watchlist_next": [
            {**w.media.to_json(), "listed_at": w.listed_at.isoformat() + "Z" if w.listed_at else None}
            for w in watchlist_next
        ],
        "stats_summary": {
            "total_shows": total_shows,
            "total_movies": total_movies,
            "total_history": total_history,
        },
    }


# ── History ─────────────────────────────────────────────────────────

@router.get("/history")
@expose()
def get_history(
    request: Request,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    media_type: str | None = Query(None),
    search: str | None = Query(None, alias="q"),
    db: Session = Depends(_get_db),
):
    """Paginated watch history with optional search."""
    q = db.query(WatchHistory).join(Media)
    if media_type:
        q = q.filter(Media.media_type == media_type)
    if search and search.strip():
        q = q.filter(Media.title.ilike(f"%{search.strip()}%"))

    total = q.count()
    items = (
        q.order_by(desc(WatchHistory.watched_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "items": [
            {
                **wh.media.to_json(),
                "watched_at": wh.watched_at.isoformat() + "Z" if wh.watched_at else None,
                "season": wh.season,
                "episode": wh.episode,
                "type": wh.media.media_type,
            }
            for wh in items
        ],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": (total + per_page - 1) // per_page,
    }


# ── Watchlist ───────────────────────────────────────────────────────

@router.get("/watchlist")
@expose()
def get_watchlist(request: Request, db: Session = Depends(_get_db)):
    """Full watchlist."""
    items = (
        db.query(WatchlistItem)
        .join(Media)
        .order_by(WatchlistItem.rank.asc().nulls_last())
        .all()
    )
    return [
        {
            **w.media.to_json(),
            "listed_at": w.listed_at.isoformat() + "Z" if w.listed_at else None,
            "notes": w.notes,
            "type": w.media.media_type,
        }
        for w in items
    ]


# ── Stats ───────────────────────────────────────────────────────────

@router.get("/stats")
@expose()
def get_stats(request: Request, db: Session = Depends(_get_db)):
    """Comprehensive viewing statistics."""
    total_shows = db.query(Media).filter_by(media_type="show").count()
    total_movies = db.query(Media).filter_by(media_type="movie").count()
    total_ratings = db.query(UserRating).count()

    ratings_rows = (
        db.query(UserRating.rating, func.count(UserRating.id))
        .group_by(UserRating.rating)
        .all()
    )
    ratings_distribution = {r: c for r, c in ratings_rows}

    genre_counts: dict[str, int] = {}
    country_counts: dict[str, int] = {}
    for media in db.query(Media).all():
        if media.genres:
            for g in media.genres:
                genre_counts[g] = genre_counts.get(g, 0) + 1
        if media.country:
            country_counts[media.country] = country_counts.get(media.country, 0) + 1

    top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:15]
    top_countries = sorted(country_counts.items(), key=lambda x: x[1], reverse=True)[:20]

    return {
        "total_shows_watched": total_shows,
        "total_movies_watched": total_movies,
        "ratings_distribution": ratings_distribution,
        "top_genres": top_genres,
        "top_countries": top_countries,
        "total_ratings": total_ratings,
        "user_stats": {
            "shows": total_shows,
            "movies": total_movies,
            "ratings": total_ratings,
        },
    }


# ── Watched Shows / Movies ─────────────────────────────────────────

@router.get("/watched/shows")
@expose()
def get_watched_shows(request: Request, db: Session = Depends(_get_db)):
    """All watched TV shows."""
    media_list = db.query(Media).filter_by(media_type="show").limit(100).all()
    return [m.to_json() for m in media_list]


@router.get("/watched/movies")
@expose()
def get_watched_movies(request: Request, db: Session = Depends(_get_db)):
    """All watched movies."""
    media_list = db.query(Media).filter_by(media_type="movie").limit(100).all()
    return [m.to_json() for m in media_list]


# ── Favorites ───────────────────────────────────────────────────────

@router.get("/favorites")
@expose()
def get_favorites(request: Request, db: Session = Depends(_get_db)):
    """User's favorites list."""
    coll = db.query(Collection).filter_by(collection_type="favorites").first()
    if not coll:
        return []
    items = (
        db.query(CollectionItem)
        .filter_by(collection_id=coll.id)
        .join(Media)
        .order_by(CollectionItem.rank.asc().nulls_last())
        .all()
    )
    return [
        {**ci.media.to_json(), "type": ci.media.media_type}
        for ci in items
    ]


# ── Trakt Collection (owned media) ──────────────────────────────────

@router.get("/collection")
@expose()
def get_trakt_collection(request: Request, db: Session = Depends(_get_db)):
    """User's owned media collection."""
    coll = db.query(Collection).filter_by(collection_type="trakt_owned").first()
    if not coll:
        return {"shows": [], "movies": [], "total_shows": 0, "total_movies": 0}

    items = (
        db.query(CollectionItem)
        .filter_by(collection_id=coll.id)
        .join(Media)
        .order_by(CollectionItem.rank.asc().nulls_last())
        .all()
    )

    shows = [ci.media.to_json() for ci in items if ci.media.media_type == "show"]
    movies = [ci.media.to_json() for ci in items if ci.media.media_type == "movie"]

    return {
        "shows": shows,
        "movies": movies,
        "total_shows": len(shows),
        "total_movies": len(movies),
    }


# ── Ratings ─────────────────────────────────────────────────────────

@router.get("/ratings")
@expose()
def get_ratings(request: Request, db: Session = Depends(_get_db)):
    """All user ratings."""
    ratings = db.query(UserRating).join(Media).all()

    shows = [
        {**r.media.to_json(), "rating": r.rating, "rated_at": r.rated_at.isoformat() + "Z" if r.rated_at else None}
        for r in ratings if r.media.media_type == "show"
    ]
    movies = [
        {**r.media.to_json(), "rating": r.rating, "rated_at": r.rated_at.isoformat() + "Z" if r.rated_at else None}
        for r in ratings if r.media.media_type == "movie"
    ]

    return {"shows": shows, "movies": movies}


# ── Detail page (single show/movie) ───────────────────────────────

@router.get("/detail/{media_type}/{tmdb_id}")
def get_detail(request: Request, media_type: str, tmdb_id: int, db: Session = Depends(_get_db)):
    """Get full detail for a movie or show: DB data + TMDB metadata."""
    if media_type not in ("show", "movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'show', 'movie', or 'tv'")

    normalized_type = "show" if media_type == "tv" else media_type
    tmdb = _get_tmdb(request)

    # Find in our DB
    db_media = db.query(Media).filter_by(media_type=normalized_type, tmdb_id=tmdb_id).first()

    # Get TMDB metadata
    tmdb_type = "tv" if normalized_type == "show" else "movie"
    tmdb_data = None
    if tmdb.available:
        tmdb_data = tmdb.get_show(tmdb_id) if normalized_type == "show" else tmdb.get_movie(tmdb_id)

    if not tmdb_data and not db_media:
        raise HTTPException(status_code=404, detail="Not found")

    result: dict = {
        "media_type": normalized_type,
        "tmdb_id": tmdb_id,
    }

    if db_media:
        result["trakt"] = db_media.to_json()
        # Add watch info
        watch_count = db.query(WatchHistory).filter_by(media_id=db_media.id).count()
        last_watch = (
            db.query(WatchHistory)
            .filter_by(media_id=db_media.id)
            .order_by(desc(WatchHistory.watched_at))
            .first()
        )
        result["trakt"]["plays"] = watch_count
        if last_watch:
            result["trakt"]["last_watched_at"] = last_watch.watched_at.isoformat() + "Z"
        # Rating
        rating = db.query(UserRating).filter_by(media_id=db_media.id).first()
        if rating:
            result["trakt"]["user_rating"] = rating.rating

    if tmdb_data:
        result["tmdb"] = tmdb_data
        # Save poster to unified store if missing
        if _posters and tmdb_data.get("poster_path"):
            trakt_id = db_media.trakt_id if db_media else None
            poster_rel = _posters.save_from_tmdb(normalized_type, tmdb_id, tmdb_data["poster_path"], trakt_id)
            if poster_rel:
                result["poster_local"] = poster_rel
                if db_media and not db_media.poster_path:
                    db_media.poster_path = poster_rel
                    db.commit()

    return result


# ── TMDB Metadata ──────────────────────────────────────────────────

@router.get("/tmdb/{media_type}/{tmdb_id}")
def get_tmdb_info(request: Request, media_type: str, tmdb_id: int):
    """Get TMDB metadata for a specific show or movie."""
    tmdb = _get_tmdb(request)
    if media_type not in ("show", "movie"):
        raise HTTPException(status_code=400, detail="media_type must be 'show' or 'movie'")

    if media_type == "show":
        data = tmdb.get_show(tmdb_id)
    else:
        data = tmdb.get_movie(tmdb_id)

    if not data:
        raise HTTPException(status_code=404, detail="Not found in TMDB")
    return data


@router.get("/tmdb/image/{media_type}/{tmdb_id}")
def get_tmdb_poster(request: Request, media_type: str, tmdb_id: int, kind: str = "poster"):
    """Get cached poster/backdrop path for a show or movie."""
    tmdb = _get_tmdb(request)
    tmdb_type = "tv" if media_type == "show" else "movie"

    if kind == "backdrop":
        path = tmdb.get_backdrop_path(tmdb_id, tmdb_type)
    else:
        path = tmdb.get_poster_path(tmdb_id, tmdb_type)

    if not path:
        raise HTTPException(status_code=404, detail="Image not available")
    return {"path": path}


# ── TMDB Settings ──────────────────────────────────────────────────

@router.get("/tmdb/status")
def get_tmdb_status(request: Request):
    """Check if TMDB API key is configured."""
    tmdb = _get_tmdb(request)
    return {
        "configured": tmdb.available,
        "has_cached_data": bool(list(tmdb.meta_cache_dir.glob("*/*.json"))) if tmdb.meta_cache_dir.exists() else False,
    }


@router.post("/tmdb/configure")
async def configure_tmdb(request: Request):
    """Save TMDB credentials to private config."""
    import json
    data = await request.json()
    bearer_token = data.get("bearer_token", "").strip()
    api_key = data.get("api_key", "").strip()

    if not bearer_token and not api_key:
        raise HTTPException(status_code=400, detail="bearer_token or api_key is required")

    private_dir = Path(request.app.state.static_folder) / "private"
    private_dir.mkdir(parents=True, exist_ok=True)
    config_path = private_dir / "_tmdb.json"

    existing = {}
    if config_path.is_file():
        try:
            with open(config_path) as f:
                existing = json.load(f)
        except (ValueError, OSError):
            pass

    if bearer_token:
        existing["bearer_token"] = bearer_token
    if api_key:
        existing["api_key"] = api_key

    with open(config_path, "w") as f:
        json.dump(existing, f)

    global _tmdb
    base = Path(request.app.state.static_folder)
    cache_dir = base / "uploads" / "data" / "shows" / "tmdb_cache"
    _tmdb = TMDBClient(cache_dir, api_key=existing.get("api_key"), bearer_token=existing.get("bearer_token"))

    return {"configured": True}


# ── Discovery ──────────────────────────────────────────────────────

@router.get("/discover/trending")
def get_trending(request: Request, media_type: str = Query("all"), time_window: str = Query("week"), page: int = Query(1, ge=1)):
    """Get trending shows/movies from TMDB."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=503, detail="TMDB not configured. Add your API key in Settings.")

    if media_type not in ("all", "movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'all', 'movie', or 'tv'")
    if time_window not in ("day", "week"):
        raise HTTPException(status_code=400, detail="time_window must be 'day' or 'week'")

    cache_key = f"trending-{media_type}-{time_window}-p{page}"
    cached = tmdb._read_cache("discover", cache_key)
    if cached:
        return cached

    data = tmdb._api_request(f"/trending/{media_type}/{time_window}", {"page": str(page)})
    if data:
        tmdb._write_cache("discover", cache_key, data)
    return data or {"results": []}


@router.get("/discover/popular")
def get_popular(request: Request, media_type: str = Query("movie"), page: int = Query(1, ge=1)):
    """Get popular shows/movies from TMDB."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=503, detail="TMDB not configured. Add your API key in Settings.")

    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'movie' or 'tv'")

    cache_key = f"popular-{media_type}-p{page}"
    cached = tmdb._read_cache("discover", cache_key)
    if cached:
        return cached

    data = tmdb._api_request(f"/{media_type}/popular", {"page": str(page)})
    if data:
        tmdb._write_cache("discover", cache_key, data)
    return data or {"results": []}


@router.get("/discover/top-rated")
def get_top_rated(request: Request, media_type: str = Query("movie"), page: int = Query(1, ge=1)):
    """Get top rated shows/movies from TMDB."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=503, detail="TMDB not configured. Add your API key in Settings.")

    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'movie' or 'tv'")

    cache_key = f"top-rated-{media_type}-p{page}"
    cached = tmdb._read_cache("discover", cache_key)
    if cached:
        return cached

    data = tmdb._api_request(f"/{media_type}/top_rated", {"page": str(page)})
    if data:
        tmdb._write_cache("discover", cache_key, data)
    return data or {"results": []}


@router.get("/discover/upcoming")
def get_upcoming(request: Request, media_type: str = Query("movie"), page: int = Query(1, ge=1)):
    """Get upcoming movies or TV shows from TMDB."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=503, detail="TMDB not configured.")

    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'movie' or 'tv'")

    cache_key = f"upcoming-{media_type}-p{page}"
    cached = tmdb._read_cache("discover", cache_key)
    if cached:
        return cached

    if media_type == "movie":
        data = tmdb._api_request("/movie/upcoming", {"page": str(page)})
    else:
        data = tmdb._api_request("/tv/on_the_air", {"page": str(page)})

    if data:
        tmdb._write_cache("discover", cache_key, data)
    return data or {"results": []}


@router.get("/discover/now-playing")
def get_now_playing(request: Request, media_type: str = Query("movie"), page: int = Query(1, ge=1)):
    """Get movies currently in cinema or shows airing today."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=503, detail="TMDB not configured.")

    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'movie' or 'tv'")

    cache_key = f"now-playing-{media_type}-p{page}"
    cached = tmdb._read_cache("discover", cache_key)
    if cached:
        return cached

    if media_type == "movie":
        data = tmdb._api_request("/movie/now_playing", {"page": str(page)})
    else:
        data = tmdb._api_request("/tv/airing_today", {"page": str(page)})

    if data:
        tmdb._write_cache("discover", cache_key, data)
    return data or {"results": []}


# ── Search ─────────────────────────────────────────────────────────

@router.get("/discover/search")
def search_tmdb(request: Request, q: str = Query(..., min_length=1), media_type: str = Query("multi")):
    """Search TMDB for shows/movies."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=503, detail="TMDB not configured.")

    if media_type not in ("multi", "movie", "tv"):
        raise HTTPException(status_code=400, detail="media_type must be 'multi', 'movie', or 'tv'")

    data = tmdb._api_request(f"/search/{media_type}", {"query": q})
    return data or {"results": []}


@router.get("/watched-tmdb-ids")
def get_watched_tmdb_ids(request: Request, db: Session = Depends(_get_db)):
    """Return set of TMDB IDs the user has watched (for filtering discover results)."""
    rows = db.query(Media.tmdb_id, Media.media_type).filter(Media.tmdb_id.isnot(None)).all()
    return {
        "ids": {f"{row.media_type}-{row.tmdb_id}": True for row in rows}
    }


# ── Collections / Playlists ────────────────────────────────────────

@router.get("/collections")
@expose()
def list_collections(request: Request, db: Session = Depends(_get_db)):
    """List all collections."""
    colls = db.query(Collection).order_by(Collection.created_at).all()
    return [c.to_json() for c in colls]


@router.get("/collections/{collection_id}")
def get_collection(request: Request, collection_id: str, db: Session = Depends(_get_db)):
    """Get a specific collection with all its items."""
    coll = db.query(Collection).filter_by(id=collection_id).first()
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    return coll.to_json(include_items=True)


@router.post("/collections")
async def create_collection(request: Request, db: Session = Depends(_get_db)):
    """Create a new collection."""
    data = await request.json()
    if not data.get("name"):
        raise HTTPException(status_code=400, detail="name is required")

    coll = Collection(
        name=data["name"],
        description=data.get("description"),
        collection_type="user",
    )
    db.add(coll)
    db.commit()
    db.refresh(coll)
    return coll.to_json()


@router.put("/collections/{collection_id}")
async def update_collection(request: Request, collection_id: str, db: Session = Depends(_get_db)):
    """Update a collection's metadata."""
    coll = db.query(Collection).filter_by(id=collection_id, collection_type="user").first()
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")

    data = await request.json()
    if "name" in data:
        coll.name = data["name"]
    if "description" in data:
        coll.description = data["description"]

    db.commit()
    db.refresh(coll)
    return coll.to_json()


@router.delete("/collections/{collection_id}")
def delete_collection(request: Request, collection_id: str, db: Session = Depends(_get_db)):
    """Delete a user collection."""
    coll = db.query(Collection).filter_by(id=collection_id, collection_type="user").first()
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    db.delete(coll)
    db.commit()
    return {"message": "Deleted"}


@router.post("/collections/{collection_id}/items")
async def add_collection_item(request: Request, collection_id: str, db: Session = Depends(_get_db)):
    """Add an item to a collection."""
    coll = db.query(Collection).filter_by(id=collection_id).first()
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")

    data = await request.json()
    media_id = data.get("media_id")
    tmdb_id = data.get("tmdb_id")
    media_type = data.get("media_type", "movie")

    if media_id:
        media = db.query(Media).filter_by(id=media_id).first()
    elif tmdb_id:
        media = db.query(Media).filter_by(tmdb_id=tmdb_id, media_type=media_type).first()
        if not media:
            media = Media(
                media_type=media_type,
                title=data.get("title", "Unknown"),
                year=data.get("year"),
                tmdb_id=tmdb_id,
            )
            db.add(media)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="media_id or tmdb_id required")

    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    existing = db.query(CollectionItem).filter_by(collection_id=coll.id, media_id=media.id).first()
    if existing:
        return coll.to_json(include_items=True)

    max_rank = db.query(func.max(CollectionItem.rank)).filter_by(collection_id=coll.id).scalar() or 0
    ci = CollectionItem(
        collection_id=coll.id,
        media_id=media.id,
        rank=max_rank + 1,
        notes=data.get("notes"),
    )
    db.add(ci)
    db.commit()
    db.refresh(coll)
    return coll.to_json(include_items=True)


@router.delete("/collections/{collection_id}/items/{item_id}")
def remove_collection_item(request: Request, collection_id: str, item_id: int, db: Session = Depends(_get_db)):
    """Remove an item from a collection."""
    ci = db.query(CollectionItem).filter_by(id=item_id, collection_id=collection_id).first()
    if not ci:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(ci)
    db.commit()
    return {"message": "Removed"}


# ── Write endpoints ────────────────────────────────────────────────

@router.post("/history")
async def add_watch_history(request: Request, db: Session = Depends(_get_db)):
    """Mark a show/movie as watched (no duplicates)."""
    from datetime import datetime, timezone
    data = await request.json()

    media = _resolve_media(db, data)

    existing = db.query(WatchHistory).filter_by(media_id=media.id).first()
    if existing:
        return {"id": existing.id, "media": media.to_json(), "watched_at": existing.watched_at.isoformat() + "Z"}

    watched_at = data.get("watched_at")
    if watched_at:
        watched_at = datetime.fromisoformat(watched_at.replace("Z", "+00:00"))
    else:
        watched_at = datetime.now(timezone.utc)

    wh = WatchHistory(
        media_id=media.id,
        watched_at=watched_at,
        season=data.get("season"),
        episode=data.get("episode"),
        source="manual",
    )
    db.add(wh)
    db.commit()
    return {"id": wh.id, "media": media.to_json(), "watched_at": wh.watched_at.isoformat() + "Z"}


@router.post("/watchlist/add")
async def add_to_watchlist(request: Request, db: Session = Depends(_get_db)):
    """Add to watchlist."""
    from datetime import datetime, timezone
    data = await request.json()

    media = _resolve_media(db, data)

    existing = db.query(WatchlistItem).filter_by(media_id=media.id).first()
    if existing:
        return {"message": "Already on watchlist", "media": media.to_json()}

    max_rank = db.query(func.max(WatchlistItem.rank)).scalar() or 0
    wi = WatchlistItem(
        media_id=media.id,
        rank=max_rank + 1,
        listed_at=datetime.now(timezone.utc),
        notes=data.get("notes"),
        source="manual",
    )
    db.add(wi)
    db.commit()
    return {"id": wi.id, "media": media.to_json()}


@router.delete("/watchlist/{media_id}")
def remove_from_watchlist(request: Request, media_id: int, db: Session = Depends(_get_db)):
    """Remove from watchlist."""
    wi = db.query(WatchlistItem).filter_by(media_id=media_id).first()
    if not wi:
        raise HTTPException(status_code=404, detail="Not on watchlist")
    db.delete(wi)
    db.commit()
    return {"message": "Removed from watchlist"}


@router.post("/rate")
async def rate_media(request: Request, db: Session = Depends(_get_db)):
    """Rate a show/movie (1-10)."""
    from datetime import datetime, timezone
    data = await request.json()

    media = _resolve_media(db, data)
    rating_val = data.get("rating")
    if not rating_val or not (1 <= rating_val <= 10):
        raise HTTPException(status_code=400, detail="rating must be 1-10")

    existing = db.query(UserRating).filter_by(media_id=media.id).first()
    if existing:
        existing.rating = rating_val
        existing.rated_at = datetime.now(timezone.utc)
        existing.source = "manual"
    else:
        existing = UserRating(
            media_id=media.id,
            rating=rating_val,
            rated_at=datetime.now(timezone.utc),
            source="manual",
        )
        db.add(existing)

    db.commit()
    return {"media": media.to_json(), "rating": rating_val}


@router.post("/import")
async def trigger_import(request: Request, db: Session = Depends(_get_db)):
    """Trigger Trakt data import."""
    from .importer import import_trakt_data
    base = Path(request.app.state.static_folder)
    shows_dir = base / "shows"
    if not shows_dir.exists():
        raise HTTPException(status_code=404, detail="No shows data directory found")

    import_trakt_data(db, shows_dir, base_dir=base)
    return {"message": "Import complete"}


def _resolve_media(db: Session, data: dict) -> Media:
    """Find or create a Media row from request data."""
    media_id = data.get("media_id")
    if media_id:
        media = db.query(Media).filter_by(id=media_id).first()
        if media:
            return media

    tmdb_id = data.get("tmdb_id")
    media_type = data.get("media_type", "movie")

    if tmdb_id:
        media = db.query(Media).filter_by(tmdb_id=tmdb_id, media_type=media_type).first()
        if media:
            return media

    trakt_id = data.get("trakt_id")
    if trakt_id:
        media = db.query(Media).filter_by(trakt_id=trakt_id, media_type=media_type).first()
        if media:
            return media

    title = data.get("title")
    if not title:
        raise HTTPException(status_code=400, detail="Cannot identify media: provide media_id, tmdb_id, trakt_id, or title")

    media = Media(
        media_type=media_type,
        title=title,
        year=data.get("year"),
        tmdb_id=tmdb_id,
        trakt_id=trakt_id,
    )
    db.add(media)
    db.flush()
    return media
