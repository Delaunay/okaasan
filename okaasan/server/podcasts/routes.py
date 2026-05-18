"""API routes for Podcasts section."""
from __future__ import annotations

import json as _json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request, Query, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from .models import Podcast, PodcastEpisode, PodcastProgress
from .metadata import PodcastIndexClient
from .rss_fetcher import fetch_feed, PodcastRefresher
from ..paths import private_folder, public_folder, cache_folder

log = logging.getLogger("okaasan.podcasts")

router = APIRouter(prefix="/podcasts", tags=["podcasts"])

_client: PodcastIndexClient | None = None
_refresher: PodcastRefresher | None = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


def _config_path(static_folder: str) -> Path:
    return private_folder() / "_podcasts.json"


def _load_config(static_folder: str) -> dict:
    path = _config_path(static_folder)
    if path.is_file():
        try:
            with open(path) as f:
                return _json.load(f)
        except (ValueError, OSError):
            pass
    return {}


def _init_client(static_folder: str) -> PodcastIndexClient:
    global _client
    cfg = _load_config(static_folder)
    api_key = cfg.get("api_key", "")
    api_secret = cfg.get("api_secret", "")

    _client = PodcastIndexClient(
        cache_folder() / "podcasts",
        public_folder() / "data" / "podcasts" / "covers",
        api_key=api_key,
        api_secret=api_secret,
    )
    return _client


def _get_client(request: Request) -> PodcastIndexClient:
    global _client
    if _client is None:
        _init_client(request.app.state.static_folder)
    return _client


# ── Search ───────────────────────────────────────────────────────────

@router.get("/search")
def search_podcasts(request: Request, q: str = Query(..., min_length=1)):
    """Search Podcast Index for podcasts."""
    client = _get_client(request)
    if not client.available:
        raise HTTPException(status_code=503, detail="Podcast Index not configured")
    results = client.search(q)
    return {"results": results}


# ── Subscriptions ────────────────────────────────────────────────────

@router.get("/subscriptions")
def list_subscriptions(request: Request, db: Session = Depends(_get_db)):
    """List all subscribed podcasts with episode counts."""
    podcasts = db.query(Podcast).order_by(Podcast.title).all()

    completed_ids = set(
        row[0] for row in
        db.query(PodcastProgress.episode_id)
        .filter(PodcastProgress.completed == True)  # noqa: E712
        .all()
    )

    result = []
    for p in podcasts:
        episode_count = db.query(func.count(PodcastEpisode.id)).filter(
            PodcastEpisode.podcast_id == p.id
        ).scalar() or 0
        ep_ids = [
            row[0] for row in
            db.query(PodcastEpisode.id).filter(PodcastEpisode.podcast_id == p.id).all()
        ]
        played_count = sum(1 for eid in ep_ids if eid in completed_ids)
        unplayed = episode_count - played_count

        data = p.to_json()
        data["image"] = f"/api/{p.cover_path}" if p.cover_path and not p.cover_path.startswith("/") else p.cover_path
        data["episode_count"] = episode_count
        data["unplayed_count"] = unplayed
        result.append(data)

    return {"podcasts": result}


@router.post("/subscribe", status_code=201)
async def subscribe(request: Request, db: Session = Depends(_get_db)):
    """Subscribe to a podcast by feed_url or podcast_index_id."""
    data = await request.json()
    feed_url = data.get("feed_url")
    podcast_index_id = data.get("podcast_index_id")
    client = _get_client(request)

    if not feed_url and not podcast_index_id:
        raise HTTPException(status_code=400, detail="feed_url or podcast_index_id required")

    if not feed_url and podcast_index_id and client.available:
        feed_info = client.get_feed(podcast_index_id)
        if not feed_info:
            raise HTTPException(status_code=404, detail="Podcast not found on Podcast Index")
        feed_url = feed_info.get("url") or feed_info.get("originalUrl")
        if not feed_url:
            raise HTTPException(status_code=400, detail="No feed URL found for podcast")

    existing = db.query(Podcast).filter(Podcast.feed_url == feed_url).first()
    if existing:
        return existing.to_json()

    title = data.get("title", "")
    author = data.get("author")
    description = data.get("description")
    cover_url = data.get("cover_url") or data.get("image")
    category = data.get("category")

    if not title:
        episodes_data = fetch_feed(feed_url)
        if not episodes_data and not data.get("title"):
            title = feed_url.split("/")[-1] or "Unknown Podcast"
        else:
            title = data.get("title") or "Unknown Podcast"

    podcast = Podcast(
        title=title,
        author=author,
        description=description,
        feed_url=feed_url,
        podcast_index_id=podcast_index_id,
        category=category,
    )
    db.add(podcast)
    db.flush()

    if cover_url and client:
        cover_path = client.download_cover(cover_url, podcast.id)
        if cover_path:
            podcast.cover_path = cover_path

    episodes_data = fetch_feed(feed_url)
    for ep_data in episodes_data:
        episode = PodcastEpisode(
            podcast_id=podcast.id,
            title=ep_data["title"],
            description=ep_data["description"],
            audio_url=ep_data["audio_url"],
            duration_ms=ep_data["duration_ms"],
            published_at=ep_data["published_at"],
            episode_number=ep_data["episode_number"],
            season_number=ep_data["season_number"],
            guid=ep_data["guid"],
        )
        db.add(episode)

    db.commit()
    db.refresh(podcast)
    return podcast.to_json()


@router.delete("/{podcast_id}")
def unsubscribe(podcast_id: int, db: Session = Depends(_get_db)):
    """Unsubscribe from a podcast."""
    podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")
    db.delete(podcast)
    db.commit()
    return {"ok": True}


# ── Podcast detail ───────────────────────────────────────────────────

@router.get("/new-episodes")
def new_episodes(request: Request, db: Session = Depends(_get_db), limit: int = Query(50, ge=1, le=200)):
    """Latest unplayed episodes across all subscriptions."""
    played_ids = (
        db.query(PodcastProgress.episode_id)
        .filter(PodcastProgress.completed == True)  # noqa: E712
        .subquery()
    )
    episodes = (
        db.query(PodcastEpisode)
        .filter(~PodcastEpisode.id.in_(played_ids))
        .order_by(desc(PodcastEpisode.published_at))
        .limit(limit)
        .all()
    )
    return [ep.to_json() for ep in episodes]


@router.get("/status")
def get_status(request: Request):
    """Return configuration status."""
    client = _get_client(request)
    return {
        "configured": client.available,
        "refresher_running": _refresher is not None and _refresher._thread is not None and _refresher._thread.is_alive(),
    }


@router.get("/{podcast_id}")
def get_podcast(podcast_id: int, db: Session = Depends(_get_db)):
    """Get podcast detail with episodes."""
    podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")
    return podcast.to_json(include_episodes=True)


@router.get("/{podcast_id}/episodes")
def get_episodes(
    podcast_id: int,
    db: Session = Depends(_get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """Get paginated episodes for a podcast."""
    podcast = db.query(Podcast).filter(Podcast.id == podcast_id).first()
    if not podcast:
        raise HTTPException(status_code=404, detail="Podcast not found")

    episodes = (
        db.query(PodcastEpisode)
        .filter(PodcastEpisode.podcast_id == podcast_id)
        .order_by(desc(PodcastEpisode.published_at))
        .offset(offset)
        .limit(limit)
        .all()
    )
    total = db.query(PodcastEpisode).filter(PodcastEpisode.podcast_id == podcast_id).count()
    return {
        "episodes": [ep.to_json() for ep in episodes],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


# ── Streaming ────────────────────────────────────────────────────────

@router.get("/stream/{episode_id}")
def stream_episode(episode_id: int, request: Request, db: Session = Depends(_get_db)):
    """Proxy stream audio from the episode's audio_url."""
    episode = db.query(PodcastEpisode).filter(PodcastEpisode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    if not episode.audio_url:
        raise HTTPException(status_code=404, detail="No audio URL for episode")

    range_header = request.headers.get("range")
    headers: dict[str, str] = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
    }
    if range_header:
        headers["Range"] = range_header

    transport = httpx.HTTPTransport(local_address="0.0.0.0")
    client = httpx.Client(timeout=30.0, transport=transport, follow_redirects=True)

    try:
        upstream = client.send(
            client.build_request("GET", episode.audio_url, headers=headers),
            stream=True,
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

    response_headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": upstream.headers.get("content-type", "audio/mpeg"),
    }
    if "content-length" in upstream.headers:
        response_headers["Content-Length"] = upstream.headers["content-length"]
    if "content-range" in upstream.headers:
        response_headers["Content-Range"] = upstream.headers["content-range"]

    status_code = upstream.status_code

    def generate():
        try:
            for chunk in upstream.iter_bytes(chunk_size=64 * 1024):
                yield chunk
        finally:
            upstream.close()
            client.close()

    return StreamingResponse(generate(), status_code=status_code, headers=response_headers)


# ── Progress ─────────────────────────────────────────────────────────

@router.post("/{episode_id}/progress")
async def save_progress(episode_id: int, request: Request, db: Session = Depends(_get_db)):
    """Save playback position for an episode."""
    episode = db.query(PodcastEpisode).filter(PodcastEpisode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    data = await request.json()
    position_ms = data.get("position_ms", 0)
    completed = data.get("completed", False)

    progress = db.query(PodcastProgress).filter(PodcastProgress.episode_id == episode_id).first()
    if progress:
        progress.position_ms = position_ms
        progress.completed = completed
        progress.last_listened_at = datetime.now(timezone.utc)
    else:
        progress = PodcastProgress(
            episode_id=episode_id,
            position_ms=position_ms,
            completed=completed,
        )
        db.add(progress)

    db.commit()
    db.refresh(progress)
    return progress.to_json()


# ── Configuration ────────────────────────────────────────────────────

@router.post("/configure")
async def configure(request: Request):
    """Save Podcast Index API credentials."""
    data = await request.json()
    static_folder = request.app.state.static_folder
    path = _config_path(static_folder)
    path.parent.mkdir(parents=True, exist_ok=True)

    config = _load_config(static_folder)
    if "api_key" in data:
        config["api_key"] = data["api_key"]
    if "api_secret" in data:
        config["api_secret"] = data["api_secret"]

    with open(path, "w") as f:
        _json.dump(config, f, indent=2)

    global _client
    _client = None

    return {"ok": True, "configured": bool(config.get("api_key") and config.get("api_secret"))}


# ── Overview & Stats ─────────────────────────────────────────────────

@router.get("/overview")
def overview(request: Request, db: Session = Depends(_get_db)):
    """Dashboard overview: stats, continue listening, and new episodes."""
    sub_count = db.query(func.count(Podcast.id)).scalar() or 0
    total_eps = db.query(func.count(PodcastEpisode.id)).scalar() or 0

    completed_count = (
        db.query(func.count(PodcastProgress.id))
        .filter(PodcastProgress.completed == True)  # noqa: E712
        .scalar() or 0
    )
    in_progress_count = (
        db.query(func.count(PodcastProgress.id))
        .filter(PodcastProgress.completed == False, PodcastProgress.position_ms > 0)  # noqa: E712
        .scalar() or 0
    )
    unplayed = total_eps - completed_count

    # Continue listening: in-progress episodes ordered by last_listened_at
    continue_rows = (
        db.query(PodcastEpisode, PodcastProgress, Podcast)
        .join(PodcastProgress, PodcastProgress.episode_id == PodcastEpisode.id)
        .join(Podcast, Podcast.id == PodcastEpisode.podcast_id)
        .filter(PodcastProgress.completed == False, PodcastProgress.position_ms > 0)  # noqa: E712
        .order_by(desc(PodcastProgress.last_listened_at))
        .limit(20)
        .all()
    )
    continue_listening = []
    for ep, prog, pod in continue_rows:
        item = ep.to_json()
        item["podcast_title"] = pod.title
        item["podcast_image"] = f"/api/{pod.cover_path}" if pod.cover_path and not pod.cover_path.startswith("/") else pod.cover_path
        item["play_position"] = (prog.position_ms or 0) / 1000.0
        item["duration"] = (ep.duration_ms or 0) / 1000.0
        item["played"] = False
        continue_listening.append(item)

    # New episodes: last 7 days, not completed
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    completed_ids = (
        db.query(PodcastProgress.episode_id)
        .filter(PodcastProgress.completed == True)  # noqa: E712
        .subquery()
    )
    new_rows = (
        db.query(PodcastEpisode, Podcast)
        .join(Podcast, Podcast.id == PodcastEpisode.podcast_id)
        .filter(PodcastEpisode.published_at >= week_ago)
        .filter(~PodcastEpisode.id.in_(completed_ids))
        .order_by(desc(PodcastEpisode.published_at))
        .limit(30)
        .all()
    )
    new_eps = []
    for ep, pod in new_rows:
        item = ep.to_json()
        item["podcast_title"] = pod.title
        item["podcast_image"] = f"/api/{pod.cover_path}" if pod.cover_path and not pod.cover_path.startswith("/") else pod.cover_path
        item["play_position"] = 0
        item["duration"] = (ep.duration_ms or 0) / 1000.0
        item["played"] = False
        new_eps.append(item)

    return {
        "stats": {
            "subscriptions": sub_count,
            "total_episodes": total_eps,
            "unplayed": unplayed,
            "in_progress": in_progress_count,
        },
        "continue_listening": continue_listening,
        "new_episodes": new_eps,
    }


@router.get("/stats")
def stats(request: Request, db: Session = Depends(_get_db)):
    """Listening statistics."""
    sub_count = db.query(func.count(Podcast.id)).scalar() or 0
    total_eps = db.query(func.count(PodcastEpisode.id)).scalar() or 0
    listened = (
        db.query(func.count(PodcastProgress.id))
        .filter(PodcastProgress.completed == True)  # noqa: E712
        .scalar() or 0
    )
    total_listen_time = (
        db.query(func.coalesce(func.sum(PodcastProgress.position_ms), 0))
        .scalar()
    )

    # Top podcasts by episodes listened
    top_pods = (
        db.query(
            Podcast.title,
            func.count(PodcastProgress.id).label("episodes_listened"),
            func.coalesce(func.sum(PodcastProgress.position_ms), 0).label("total_time_ms"),
        )
        .join(PodcastEpisode, PodcastEpisode.podcast_id == Podcast.id)
        .join(PodcastProgress, PodcastProgress.episode_id == PodcastEpisode.id)
        .filter(PodcastProgress.completed == True)  # noqa: E712
        .group_by(Podcast.id)
        .order_by(desc("episodes_listened"))
        .limit(10)
        .all()
    )
    top_podcasts = [
        {"name": row[0], "episodes_listened": row[1], "total_time_ms": row[2]}
        for row in top_pods
    ]

    # Categories
    cat_rows = (
        db.query(Podcast.category, func.count(Podcast.id).label("count"))
        .filter(Podcast.category.isnot(None))
        .group_by(Podcast.category)
        .order_by(desc("count"))
        .all()
    )
    categories = [{"name": row[0], "count": row[1]} for row in cat_rows]

    # Listening history
    history_rows = (
        db.query(PodcastEpisode, PodcastProgress, Podcast)
        .join(PodcastProgress, PodcastProgress.episode_id == PodcastEpisode.id)
        .join(Podcast, Podcast.id == PodcastEpisode.podcast_id)
        .order_by(desc(PodcastProgress.last_listened_at))
        .limit(50)
        .all()
    )
    listening_history = []
    for ep, prog, pod in history_rows:
        item = ep.to_json()
        item["podcast_title"] = pod.title
        item["podcast_image"] = pod.cover_path
        item["last_listened_at"] = prog.last_listened_at.isoformat() + "Z" if prog.last_listened_at else None
        listening_history.append(item)

    return {
        "summary": {
            "subscriptions": sub_count,
            "total_episodes": total_eps,
            "listened": listened,
            "total_listen_time_ms": total_listen_time,
        },
        "top_podcasts": top_podcasts,
        "categories": categories,
        "listening_history": listening_history,
    }


# ── Settings aliases ─────────────────────────────────────────────────

@router.get("/settings/status")
def settings_status(request: Request):
    """Alias for /status."""
    return get_status(request)


@router.post("/settings/configure")
async def settings_configure(request: Request):
    """Alias for /configure."""
    return await configure(request)


# ── Episode actions ──────────────────────────────────────────────────

@router.post("/episodes/{episode_id}/position")
async def save_episode_position(episode_id: int, request: Request, db: Session = Depends(_get_db)):
    """Save playback position (body: {position} in seconds)."""
    episode = db.query(PodcastEpisode).filter(PodcastEpisode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    data = await request.json()
    position_s = data.get("position", 0)
    position_ms = int(position_s * 1000)

    progress = db.query(PodcastProgress).filter(PodcastProgress.episode_id == episode_id).first()
    if progress:
        progress.position_ms = position_ms
        progress.last_listened_at = datetime.now(timezone.utc)
    else:
        progress = PodcastProgress(
            episode_id=episode_id,
            position_ms=position_ms,
            completed=False,
        )
        db.add(progress)

    db.commit()
    db.refresh(progress)
    return progress.to_json()


@router.post("/episodes/{episode_id}/played")
def mark_episode_played(episode_id: int, db: Session = Depends(_get_db)):
    """Mark an episode as completed."""
    episode = db.query(PodcastEpisode).filter(PodcastEpisode.id == episode_id).first()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")

    progress = db.query(PodcastProgress).filter(PodcastProgress.episode_id == episode_id).first()
    if progress:
        progress.completed = True
        progress.last_listened_at = datetime.now(timezone.utc)
    else:
        progress = PodcastProgress(
            episode_id=episode_id,
            position_ms=episode.duration_ms or 0,
            completed=True,
        )
        db.add(progress)

    db.commit()
    db.refresh(progress)
    return progress.to_json()


# ── Unsubscribe alias ────────────────────────────────────────────────

@router.delete("/unsubscribe/{podcast_id}")
def unsubscribe_alias(podcast_id: int, db: Session = Depends(_get_db)):
    """Alias for DELETE /{podcast_id}."""
    return unsubscribe(podcast_id, db=db)
