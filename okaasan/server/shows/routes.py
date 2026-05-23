"""API routes for Shows & Movies section."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Query, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from ..decorators import expose
from ..paths import private_folder, public_folder, cache_folder
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
    cache_dir = cache_folder() / "shows" / "tmdb"
    image_dir = public_folder() / "data" / "shows" / "tmdb_images"

    tmdb_key = None
    tmdb_bearer = None
    config_path = private_folder() / "_tmdb.json"
    if config_path.is_file():
        try:
            with open(config_path) as f:
                cfg = _json.load(f)
                tmdb_key = cfg.get("api_key")
                tmdb_bearer = cfg.get("bearer_token")
        except (ValueError, OSError):
            pass

    _tmdb = TMDBClient(cache_dir, api_key=tmdb_key, bearer_token=tmdb_bearer, image_dir=image_dir)
    _posters = PosterStore(base)
    return _tmdb


def _get_tmdb(request: Request) -> TMDBClient:
    global _tmdb
    if _tmdb is None:
        _init_tmdb(request.app.state.static_folder)
    return _tmdb


def _get_tmdb_client_for_import(static_folder: str) -> TMDBClient:
    """Get TMDB client without a Request object (for startup import)."""
    global _tmdb
    if _tmdb is None:
        _init_tmdb(static_folder)
    return _tmdb


# ── Overview ────────────────────────────────────────────────────────

@router.get("/overview")
@expose()
def get_overview(request: Request, db: Session = Depends(_get_db)):
    """Overview: recently added unwatched library files, watchlist next, summary stats."""
    from .library_models import MediaFile
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy import func as sa_func

    # Get IDs of media with any watch history (movies or shows with episodes logged)
    watched_movie_ids = set(
        mid for (mid,) in db.query(WatchHistory.media_id)
        .filter(WatchHistory.season.is_(None))
        .distinct()
        .all()
    )
    watched_show_ids = set(
        mid for (mid,) in db.query(WatchHistory.media_id)
        .filter(WatchHistory.season.isnot(None))
        .distinct()
        .all()
    )
    fully_watched_ids = watched_movie_ids | watched_show_ids

    # Recently added library files — split into shows and movies
    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()

    def _recent_by_type(media_types: list[str], limit: int = 12) -> list[dict]:
        sub = (
            pdb.query(
                MediaFile.media_id,
                sa_func.max(MediaFile.last_scanned).label("latest"),
            )
            .filter(
                MediaFile.matched == True,
                MediaFile.media_id.isnot(None),
                MediaFile.media_type.in_(media_types),
                MediaFile.media_id.notin_(fully_watched_ids) if fully_watched_ids else True,
            )
            .group_by(MediaFile.media_id)
            .order_by(sa_func.max(MediaFile.last_scanned).desc())
            .limit(limit)
            .subquery()
        )
        rows = (
            pdb.query(MediaFile)
            .join(sub, (MediaFile.media_id == sub.c.media_id) & (MediaFile.last_scanned == sub.c.latest))
            .order_by(MediaFile.last_scanned.desc().nulls_last())
            .all()
        )
        seen: set[int] = set()
        result = []
        for f in rows:
            if f.media_id in seen:
                continue
            seen.add(f.media_id)
            result.append(f.to_json())
        return result

    try:
        recent_shows_raw = _recent_by_type(["show", "anime"], limit=20)
        recent_movies_raw = _recent_by_type(["movie"], limit=20)
    finally:
        pdb.close()

    # Enrich with poster/metadata from main DB
    all_media_ids = {f["media_id"] for f in recent_shows_raw + recent_movies_raw if f["media_id"]}
    media_map: dict[int, Media] = {}
    if all_media_ids:
        media_rows = db.query(Media).filter(Media.id.in_(all_media_ids)).all()
        media_map = {m.id: m for m in media_rows}

    def _enrich(items: list[dict]) -> list[dict]:
        for f in items:
            mid = f.get("media_id")
            m = media_map.get(mid) if mid else None
            if m:
                f["poster_path"] = m.poster_path
                f["year"] = m.year
                f["db_title"] = m.title
        return items

    recently_added_shows = _enrich(recent_shows_raw)
    recently_added_movies = _enrich(recent_movies_raw)

    watchlist_next = (
        db.query(WatchlistItem)
        .join(Media)
        .order_by(WatchlistItem.rank.asc().nulls_last())
        .limit(20)
        .all()
    )

    total_shows = db.query(Media).filter_by(media_type="show").count()
    total_movies = db.query(Media).filter_by(media_type="movie").count()
    total_history = db.query(WatchHistory).count()

    return {
        "recently_added_shows": recently_added_shows,
        "recently_added_movies": recently_added_movies,
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
                "watch_history_id": wh.id,
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
    """Comprehensive viewing statistics, split by media type."""
    total_shows = db.query(Media).filter_by(media_type="show").count()
    total_movies = db.query(Media).filter_by(media_type="movie").count()

    def _ratings_dist(media_type: str | None = None) -> dict[int, int]:
        q = db.query(UserRating.rating, func.count(UserRating.id))
        if media_type:
            q = q.join(Media).filter(Media.media_type == media_type)
        return {r: c for r, c in q.group_by(UserRating.rating).all()}

    def _genre_country(media_type: str | None = None):
        q = db.query(Media)
        if media_type:
            q = q.filter(Media.media_type == media_type)
        genres: dict[str, int] = {}
        countries: dict[str, int] = {}
        for m in q.all():
            if m.genres:
                for g in m.genres:
                    genres[g] = genres.get(g, 0) + 1
            if m.country:
                countries[m.country] = countries.get(m.country, 0) + 1
        return (
            sorted(genres.items(), key=lambda x: x[1], reverse=True)[:15],
            sorted(countries.items(), key=lambda x: x[1], reverse=True)[:20],
        )

    all_genres, all_countries = _genre_country()
    show_genres, show_countries = _genre_country("show")
    movie_genres, movie_countries = _genre_country("movie")

    total_ratings = db.query(UserRating).count()
    show_ratings = db.query(UserRating).join(Media).filter(Media.media_type == "show").count()
    movie_ratings = db.query(UserRating).join(Media).filter(Media.media_type == "movie").count()

    return {
        "total_shows_watched": total_shows,
        "total_movies_watched": total_movies,
        "ratings_distribution": _ratings_dist(),
        "top_genres": all_genres,
        "top_countries": all_countries,
        "total_ratings": total_ratings,
        "user_stats": {
            "shows": total_shows,
            "movies": total_movies,
            "ratings": total_ratings,
        },
        "shows": {
            "ratings_distribution": _ratings_dist("show"),
            "top_genres": show_genres,
            "top_countries": show_countries,
            "total_ratings": show_ratings,
        },
        "movies": {
            "ratings_distribution": _ratings_dist("movie"),
            "top_genres": movie_genres,
            "top_countries": movie_countries,
            "total_ratings": movie_ratings,
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


@router.post("/favorites/toggle")
async def toggle_favorite(request: Request, db: Session = Depends(_get_db)):
    """Toggle a media item in/out of favorites. Body: {media_id: int}."""
    body = await request.json()
    media_id = body.get("media_id")
    if not media_id:
        raise HTTPException(status_code=400, detail="media_id required")

    media = db.query(Media).filter_by(id=media_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    coll = db.query(Collection).filter_by(collection_type="favorites").first()
    if not coll:
        coll = Collection(name="Favorites", collection_type="favorites")
        db.add(coll)
        db.flush()

    existing = db.query(CollectionItem).filter_by(collection_id=coll.id, media_id=media_id).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"favorited": False, "media_id": media_id}
    else:
        item = CollectionItem(collection_id=coll.id, media_id=media_id)
        db.add(item)
        db.commit()
        return {"favorited": True, "media_id": media_id}


@router.get("/favorites/ids")
def get_favorite_ids(request: Request, db: Session = Depends(_get_db)):
    """Return the set of media_ids that are favorited."""
    coll = db.query(Collection).filter_by(collection_type="favorites").first()
    if not coll:
        return {"ids": []}
    ids = [ci.media_id for ci in db.query(CollectionItem.media_id).filter_by(collection_id=coll.id).all()]
    return {"ids": ids}


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


# ── Schedule: upcoming & continue watching ─────────────────────────

@router.get("/schedule")
def get_schedule(request: Request, db: Session = Depends(_get_db)):
    """Get upcoming episodes (next 7 days) and continue-watching shows."""
    from datetime import datetime, timezone, timedelta

    tmdb = _get_tmdb(request)
    today_utc = datetime.now(timezone.utc).date()
    # Include 1 day before UTC today to cover all client timezones
    start_date = today_utc - timedelta(days=1)
    week_ahead = today_utc + timedelta(days=7)

    # Get all tracked shows that might still be airing (exclude dropped only)
    from sqlalchemy import or_
    shows = (
        db.query(Media)
        .filter(
            Media.media_type == "show",
            Media.tmdb_id.isnot(None),
            or_(Media.user_status.is_(None), Media.user_status != "dropped"),
        )
        .all()
    )

    upcoming_episodes = []
    continue_watching = []
    suggestions = []

    for show in shows:
        if not tmdb.available:
            break

        tmdb_data = tmdb.get_show(show.tmdb_id)
        if not tmdb_data:
            continue

        show_info = {
            "id": show.id,
            "title": show.title,
            "tmdb_id": show.tmdb_id,
            "poster_path": show.poster_path,
            "media_type": "show",
        }

        # Check both next and last episode — TMDB moves today's ep to "last" once it airs
        for ep_key in ("next_episode_to_air", "last_episode_to_air"):
            ep = tmdb_data.get(ep_key)
            if ep and ep.get("air_date"):
                try:
                    air_date = datetime.strptime(ep["air_date"], "%Y-%m-%d").date()
                    if start_date <= air_date <= week_ahead:
                        upcoming_episodes.append({
                            **show_info,
                            "episode": {
                                "season": ep.get("season_number"),
                                "episode": ep.get("episode_number"),
                                "name": ep.get("name"),
                                "air_date": ep["air_date"],
                                "overview": ep.get("overview", ""),
                            },
                        })
                except (ValueError, TypeError):
                    pass

        # Continue watching: show has aired episodes beyond what user watched
        # Use last_episode_to_air as baseline, but also consider
        # next_episode_to_air if it has already aired (TMDB can lag
        # in moving an episode from "next" to "last").
        last_ep = tmdb_data.get("last_episode_to_air")
        next_ep_data = tmdb_data.get("next_episode_to_air")

        # Pick the most recent actually-aired episode
        effective_ep = None
        if last_ep and last_ep.get("air_date"):
            try:
                last_air = datetime.strptime(last_ep["air_date"], "%Y-%m-%d").date()
                if last_air <= today_utc:
                    effective_ep = last_ep
            except (ValueError, TypeError):
                pass
        if next_ep_data and next_ep_data.get("air_date"):
            try:
                next_air = datetime.strptime(next_ep_data["air_date"], "%Y-%m-%d").date()
                if next_air <= today_utc:
                    ns = next_ep_data.get("season_number", 0)
                    ne = next_ep_data.get("episode_number", 0)
                    if effective_ep is None:
                        effective_ep = next_ep_data
                    else:
                        es = effective_ep.get("season_number", 0)
                        ee = effective_ep.get("episode_number", 0)
                        if (ns, ne) > (es, ee):
                            effective_ep = next_ep_data
            except (ValueError, TypeError):
                pass

        if effective_ep:
            # Get the user's most recent watched entry that has episode info
            last_watched = (
                db.query(WatchHistory)
                .filter(
                    WatchHistory.media_id == show.id,
                    WatchHistory.season.isnot(None),
                    WatchHistory.season > 0,
                )
                .order_by(desc(WatchHistory.season), desc(WatchHistory.episode))
                .first()
            )

            tmdb_season = effective_ep.get("season_number", 0)
            tmdb_episode = effective_ep.get("episode_number", 0)

            if not last_watched:
                # No episode-level tracking — show is in library/watchlist
                # but user hasn't started watching yet.
                first_regular = next(
                    (s for s in tmdb_data.get("seasons", []) if s.get("season_number", 0) >= 1),
                    None,
                )
                if not first_regular:
                    continue
                suggestions.append({
                    **show_info,
                    "last_watched": {"season": 0, "episode": 0},
                    "next_episode": {"season": first_regular.get("season_number", 1), "episode": 1},
                    "latest_aired": {"season": tmdb_season, "episode": tmdb_episode},
                })
                continue

            user_season = last_watched.season
            user_episode = last_watched.episode or 0

            if (tmdb_season, tmdb_episode) > (user_season, user_episode):
                # Determine next unwatched episode
                next_season = user_season
                next_episode = user_episode + 1
                # Check if the next episode exists in the same season
                seasons_data = tmdb_data.get("seasons", [])
                current_season_info = next(
                    (s for s in seasons_data if s.get("season_number") == user_season), None
                )
                if current_season_info:
                    ep_count = current_season_info.get("episode_count", 0)
                    if next_episode > ep_count:
                        next_season = user_season + 1
                        next_episode = 1

                continue_watching.append({
                    **show_info,
                    "last_watched": {
                        "season": user_season,
                        "episode": user_episode,
                    },
                    "next_episode": {
                        "season": next_season,
                        "episode": next_episode,
                    },
                    "latest_aired": {
                        "season": tmdb_season,
                        "episode": tmdb_episode,
                    },
                    "last_watched_at": last_watched.watched_at.isoformat() + "Z" if last_watched.watched_at else None,
                })

    # Deduplicate (same show+season+episode can appear from both next/last)
    seen = set()
    deduped = []
    for ep in upcoming_episodes:
        key = (ep["tmdb_id"], ep["episode"]["season"], ep["episode"]["episode"])
        if key not in seen:
            seen.add(key)
            deduped.append(ep)
    deduped.sort(key=lambda x: x["episode"]["air_date"])

    continue_watching.sort(key=lambda x: x.get("last_watched_at") or "", reverse=True)

    return {
        "upcoming": deduped,
        "continue_watching": continue_watching,
        "suggestions": suggestions,
    }


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

    # For shows, include per-season watched episode counts
    if normalized_type == "show" and db_media and tmdb_data and tmdb_data.get("seasons"):
        from sqlalchemy import func as sqla_func
        season_watch_counts = dict(
            db.query(WatchHistory.season, sqla_func.count(WatchHistory.id))
            .filter(
                WatchHistory.media_id == db_media.id,
                WatchHistory.season.isnot(None),
                WatchHistory.season > 0,
                WatchHistory.episode.isnot(None),
            )
            .group_by(WatchHistory.season)
            .all()
        )
        watched_seasons = {}
        for s in tmdb_data["seasons"]:
            sn = s.get("season_number", 0)
            if sn == 0:
                continue
            ep_count = s.get("episode_count", 0)
            watched_count = season_watch_counts.get(sn, 0)
            watched_seasons[sn] = {
                "watched": watched_count,
                "total": ep_count,
                "complete": ep_count > 0 and watched_count >= ep_count,
            }
        result["watched_seasons"] = watched_seasons

    return result


@router.get("/detail/tv/{tmdb_id}/season/{season_number}")
def get_season_detail(request: Request, tmdb_id: int, season_number: int, db: Session = Depends(_get_db)):
    """Get episodes for a specific season of a TV show."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=503, detail="TMDB not available")

    data = tmdb.get_season(tmdb_id, season_number)
    if not data:
        raise HTTPException(status_code=404, detail="Season not found")

    # Get watched episodes for this show+season from DB
    watched_eps: set[int] = set()
    db_media = db.query(Media).filter_by(media_type="show", tmdb_id=tmdb_id).first()
    if db_media:
        history = (
            db.query(WatchHistory.episode)
            .filter(
                WatchHistory.media_id == db_media.id,
                WatchHistory.season == season_number,
                WatchHistory.episode.isnot(None),
            )
            .all()
        )
        watched_eps = {row[0] for row in history}

    episodes = []
    for ep in data.get("episodes", []):
        ep_num = ep.get("episode_number")
        episodes.append({
            "episode_number": ep_num,
            "name": ep.get("name"),
            "overview": ep.get("overview", ""),
            "air_date": ep.get("air_date"),
            "runtime": ep.get("runtime"),
            "still_path": ep.get("still_path"),
            "vote_average": ep.get("vote_average"),
            "watched": ep_num in watched_eps,
        })

    all_watched = len(episodes) > 0 and all(ep["watched"] for ep in episodes)

    return {
        "season_number": season_number,
        "name": data.get("name"),
        "overview": data.get("overview"),
        "air_date": data.get("air_date"),
        "episodes": episodes,
        "all_watched": all_watched,
    }


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

    config_path = private_folder() / "_tmdb.json"

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
    _tmdb = TMDBClient(
        cache_folder() / "shows" / "tmdb",
        api_key=existing.get("api_key"),
        bearer_token=existing.get("bearer_token"),
        image_dir=public_folder() / "data" / "shows" / "tmdb_images",
    )

    return {"configured": True}


# ── Anime Metadata (Kitsu) ────────────────────────────────────────

@router.get("/anime/status")
def get_anime_status():
    """Check if Kitsu API is reachable (no auth needed)."""
    return {"provider": "kitsu", "configured": True, "auth_required": False}


@router.post("/anime/test")
async def test_anime_search():
    """Test Kitsu anime search with a known title."""
    from .library import _search_kitsu_anime
    results = _search_kitsu_anime("Solo Leveling")
    if results:
        attrs = results[0].get("attributes", {})
        titles = attrs.get("titles", {})
        return {
            "success": True,
            "provider": "kitsu",
            "sample_result": {
                "title": titles.get("en") or attrs.get("canonicalTitle"),
                "japanese": titles.get("ja_jp"),
                "episodes": attrs.get("episodeCount"),
            },
        }
    return {"success": False, "provider": "kitsu", "error": "No results returned — Kitsu may be down"}


@router.post("/anime/import")
async def import_kitsu_dump(request: Request):
    """Re-import Kitsu/MAL XML dump in the background."""
    import asyncio
    from pathlib import Path
    from ..paths import STATIC_FOLDER, private_folder
    from .importer import import_kitsu_data

    dumps_dir = Path(STATIC_FOLDER) / "dumps" / "kitsu"
    if not dumps_dir.is_dir():
        return {"success": False, "error": "No Kitsu dump found at dumps/kitsu/"}

    SessionLocal = request.app.state.SessionLocal

    def _run():
        db = SessionLocal()
        try:
            import_kitsu_data(db, dumps_dir)
            marker = private_folder() / "_kitsu_imported.marker"
            marker.write_text("done")
        except Exception as e:
            log.warning("Kitsu import failed: %s", e)
        finally:
            db.close()

    asyncio.get_event_loop().run_in_executor(None, _run)
    return {"success": True, "message": "Kitsu import started in background"}


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
    """Return set of TMDB IDs the user has actually watched (has history entries)."""
    rows = (
        db.query(Media.tmdb_id, Media.media_type)
        .join(WatchHistory, WatchHistory.media_id == Media.id)
        .filter(Media.tmdb_id.isnot(None))
        .distinct()
        .all()
    )
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
    """Mark a show/movie as watched (no duplicates per media+season+episode)."""
    from datetime import datetime, timezone
    data = await request.json()

    media = _resolve_media(db, data)
    if media.user_status == "dropped":
        media.user_status = None

    season = data.get("season")
    episode = data.get("episode")

    # Dedup: check for same media + season + episode combo
    q = db.query(WatchHistory).filter_by(media_id=media.id)
    if season is not None:
        q = q.filter_by(season=season, episode=episode)
    else:
        q = q.filter(WatchHistory.season.is_(None))
    existing = q.first()
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
        season=season,
        episode=episode,
        source="manual",
    )
    db.add(wh)
    db.commit()
    return {"id": wh.id, "media": media.to_json(), "watched_at": wh.watched_at.isoformat() + "Z"}


@router.delete("/history/{history_id}")
def delete_watch_history(request: Request, history_id: int, db: Session = Depends(_get_db)):
    """Delete a single watch-history entry.  Resets user_status when no history remains."""
    wh = db.query(WatchHistory).filter_by(id=history_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="History entry not found")
    media_id = wh.media_id
    db.delete(wh)
    db.flush()

    remaining = db.query(WatchHistory).filter_by(media_id=media_id).count()
    if remaining == 0:
        media = db.query(Media).filter_by(id=media_id).first()
        if media and media.user_status == "dropped":
            media.user_status = None

    db.commit()
    return {"message": "Deleted"}


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


@router.post("/mark-completed")
async def mark_show_completed(request: Request, db: Session = Depends(_get_db)):
    """Mark a show as fully watched (completed).

    Backfills watch-history for every episode from the user's last
    watched position up to the latest aired episode using TMDB season
    data.  Does NOT set user_status — completion is determined
    dynamically from watch history vs aired episodes.
    """
    from datetime import datetime, timezone
    data = await request.json()
    media = _resolve_media(db, data)

    target_season = data.get("season")
    target_episode = data.get("episode")

    if target_season and target_episode and media.tmdb_id:
        tmdb = _get_tmdb(request)
        now = datetime.now(timezone.utc)

        # Figure out where the user left off
        last_watched = (
            db.query(WatchHistory)
            .filter(
                WatchHistory.media_id == media.id,
                WatchHistory.season.isnot(None),
                WatchHistory.season > 0,
            )
            .order_by(desc(WatchHistory.season), desc(WatchHistory.episode))
            .first()
        )
        start_season = last_watched.season if last_watched else 1
        start_episode = (last_watched.episode or 0) + 1 if last_watched else 1

        already_watched: set[tuple[int, int]] = set()
        for row in (
            db.query(WatchHistory.season, WatchHistory.episode)
            .filter(
                WatchHistory.media_id == media.id,
                WatchHistory.season.isnot(None),
                WatchHistory.episode.isnot(None),
            )
            .all()
        ):
            already_watched.add((row[0], row[1]))

        added = 0
        for sn in range(start_season, target_season + 1):
            season_data = tmdb.get_season(media.tmdb_id, sn) if tmdb.available else None
            if season_data:
                ep_count = len(season_data.get("episodes", []))
            else:
                ep_count = target_episode if sn == target_season else 0

            first_ep = start_episode if sn == start_season else 1
            last_ep = target_episode if sn == target_season else ep_count

            for ep in range(first_ep, last_ep + 1):
                if (sn, ep) in already_watched:
                    continue
                db.add(WatchHistory(
                    media_id=media.id,
                    watched_at=now,
                    season=sn,
                    episode=ep,
                    source="manual",
                ))
                added += 1

    db.commit()
    return {"message": "Marked all episodes as watched", "media": media.to_json()}


@router.post("/mark-dropped")
async def mark_show_dropped(request: Request, db: Session = Depends(_get_db)):
    """Mark a show as dropped (not going to watch anymore)."""
    data = await request.json()
    media = _resolve_media(db, data)
    media.user_status = "dropped"
    db.commit()
    return {"message": "Marked as dropped", "media": media.to_json()}


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

    tmdb = _get_tmdb(request)
    import_trakt_data(db, shows_dir, base_dir=base, tmdb_client=tmdb)
    return {"message": "Import complete"}


@router.post("/backfill-posters")
async def backfill_posters(request: Request, db: Session = Depends(_get_db)):
    """Fetch posters from TMDB for all media entries missing a poster."""
    tmdb = _get_tmdb(request)
    if not tmdb.available:
        raise HTTPException(status_code=400, detail="TMDB not configured")

    base = Path(request.app.state.static_folder)
    posters = PosterStore(base)

    missing = db.query(Media).filter(
        Media.poster_path.is_(None),
        Media.tmdb_id.isnot(None),
    ).all()

    fetched = 0
    for media in missing:
        try:
            if media.media_type == "show":
                info = tmdb.get_show(media.tmdb_id)
            else:
                info = tmdb.get_movie(media.tmdb_id)
            if info and info.get("poster_path"):
                path = posters.save_from_tmdb(
                    media.media_type, media.tmdb_id, info["poster_path"], media.trakt_id
                )
                if path:
                    media.poster_path = path
                    fetched += 1
        except Exception:
            continue

    db.commit()
    return {"message": f"Backfilled {fetched} posters out of {len(missing)} missing"}


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


# ── Library (media files on disk) ─────────────────────────────────

_library_scanner = None


def _get_private_db(request: Request):
    from sqlalchemy.orm import sessionmaker
    Session = sessionmaker(bind=request.app.state.private_engine)
    db = Session()
    try:
        yield db
    finally:
        db.close()


@router.get("/library/status")
def library_status(request: Request):
    """Get library scan status and stats."""
    from .library import load_config
    from .library_models import MediaFile
    from sqlalchemy.orm import sessionmaker

    config = load_config(request.app.state.static_folder)
    Session = sessionmaker(bind=request.app.state.private_engine)
    db = Session()
    try:
        total = db.query(MediaFile).count()
        matched = db.query(MediaFile).filter_by(matched=True).count()
    finally:
        db.close()

    global _library_scanner
    last_scan = _library_scanner.last_scan.isoformat() + "Z" if _library_scanner and _library_scanner.last_scan else None

    return {
        "configured": bool(any(config.get("folders", {}).values())),
        "folders": config.get("folders", {}),
        "total_files": total,
        "matched_files": matched,
        "unmatched_files": total - matched,
        "last_scan": last_scan,
        "scan_interval_minutes": config.get("scan_interval_minutes", 60),
    }


@router.post("/library/configure")
async def library_configure(request: Request):
    """Save library folder configuration."""
    from .library import save_config, load_config
    data = await request.json()

    config = load_config(request.app.state.static_folder)
    if "folders" in data:
        config["folders"] = data["folders"]
    if "scan_interval_minutes" in data:
        config["scan_interval_minutes"] = data["scan_interval_minutes"]
    if "video_extensions" in data:
        config["video_extensions"] = data["video_extensions"]

    save_config(request.app.state.static_folder, config)
    return {"message": "Configuration saved", "config": config}


@router.post("/library/scan")
async def library_scan(request: Request):
    """Trigger a manual library scan."""
    import asyncio
    global _library_scanner
    if _library_scanner:
        result = await asyncio.to_thread(_library_scanner.scan_now)
    else:
        from .library import scan_folders
        from sqlalchemy import create_engine
        static_folder = request.app.state.static_folder
        private_engine = request.app.state.private_engine
        db_path = os.path.join(static_folder, "database.db")
        main_engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
        result = await asyncio.to_thread(scan_folders, static_folder, private_engine, main_engine)

    return {"message": "Scan complete", **result}


@router.get("/library/all-files")
def library_all_files(request: Request, db: Session = Depends(_get_db)):
    """Get all library files, enriched with poster and watch-progress info for matched items."""
    from .library_models import MediaFile
    from sqlalchemy.orm import sessionmaker

    PrivateSession = sessionmaker(bind=request.app.state.private_engine)
    pdb = PrivateSession()
    try:
        files = pdb.query(MediaFile).order_by(
            MediaFile.title, MediaFile.season, MediaFile.episode
        ).all()
        raw = [f.to_json() for f in files]
    finally:
        pdb.close()

    # Gather media_ids that are matched to enrich with poster + watch data
    media_ids = {f["media_id"] for f in raw if f["media_id"]}
    if media_ids:
        media_rows = db.query(Media).filter(Media.id.in_(media_ids)).all()
        media_map = {m.id: m for m in media_rows}

        watched_eps: dict[int, set[tuple[int, int]]] = {}
        for wh in (
            db.query(WatchHistory.media_id, WatchHistory.season, WatchHistory.episode)
            .filter(
                WatchHistory.media_id.in_(media_ids),
                WatchHistory.season.isnot(None),
                WatchHistory.episode.isnot(None),
            )
            .all()
        ):
            watched_eps.setdefault(wh[0], set()).add((wh[1], wh[2]))
    else:
        media_map = {}
        watched_eps = {}

    # Build enrichment lookup keyed by media_id
    enrichment: dict[int, dict] = {}
    for mid, m in media_map.items():
        enrichment[mid] = {
            "poster_path": m.poster_path,
            "year": m.year,
            "db_title": m.title,
        }

    # Attach enrichment to each file
    for f in raw:
        mid = f.get("media_id")
        if mid and mid in enrichment:
            f["poster_path"] = enrichment[mid].get("poster_path")
            f["year"] = enrichment[mid].get("year")
            f["db_title"] = enrichment[mid].get("db_title")
        else:
            f["poster_path"] = None
            f["year"] = None
            f["db_title"] = None

    # Build per-media watched sets summary for the frontend
    watched_summary: dict[int, list[list[int]]] = {}
    for mid, eps in watched_eps.items():
        watched_summary[mid] = [[s, e] for s, e in sorted(eps)]

    # Find watched movies (watch history without season/episode)
    movie_media_ids = {f["media_id"] for f in raw if f["media_id"] and f["media_type"] == "movie"}
    watched_movie_ids: list[int] = []
    if movie_media_ids:
        watched_movie_ids = [
            mid for (mid,) in db.query(WatchHistory.media_id)
            .filter(WatchHistory.media_id.in_(movie_media_ids))
            .distinct()
            .all()
        ]

    return {"files": raw, "watched": watched_summary, "watched_movies": watched_movie_ids}


@router.get("/library/files/{media_id}")
def library_files_for_media(request: Request, media_id: int):
    """Get all library files for a given media entry."""
    from .library_models import MediaFile
    from sqlalchemy.orm import sessionmaker

    Session = sessionmaker(bind=request.app.state.private_engine)
    db = Session()
    try:
        files = db.query(MediaFile).filter_by(media_id=media_id).order_by(
            MediaFile.season, MediaFile.episode
        ).all()
        return [f.to_json() for f in files]
    finally:
        db.close()


@router.get("/library/files-by-tmdb/{tmdb_id}")
def library_files_by_tmdb(request: Request, tmdb_id: int):
    """Get all library files for a given TMDB ID."""
    from .library_models import MediaFile
    from sqlalchemy.orm import sessionmaker

    Session = sessionmaker(bind=request.app.state.private_engine)
    db = Session()
    try:
        files = db.query(MediaFile).filter_by(tmdb_id=tmdb_id).order_by(
            MediaFile.season, MediaFile.episode
        ).all()
        return [f.to_json() for f in files]
    finally:
        db.close()


@router.get("/library/stream/{file_id}")
async def library_stream(request: Request, file_id: int):
    """Stream a video file (transcoded)."""
    from .library_models import MediaFile
    from .streamer import get_streamer
    from sqlalchemy.orm import sessionmaker

    Session = sessionmaker(bind=request.app.state.private_engine)
    db = Session()
    try:
        mf = db.query(MediaFile).filter_by(id=file_id).first()
        if not mf:
            raise HTTPException(status_code=404, detail="File not found")
        file_path = mf.file_path
    finally:
        db.close()

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File no longer exists on disk")

    range_header = request.headers.get("range")
    streamer = get_streamer(file_path)
    return streamer.stream(file_path, range_header)


@router.post("/library/stream/stop")
async def library_stream_stop():
    """Kill all active VLC streaming processes."""
    from ..vlc_streamer import kill_all
    killed = kill_all()
    log.info("Stream stop requested — killed %d VLC processes", killed)
    return {"killed": killed}
