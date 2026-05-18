"""API routes for Podcasts section."""
from __future__ import annotations

import json as _json
import logging
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request, Query, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from .models import Podcast, PodcastEpisode, PodcastProgress
from .metadata import PodcastIndexClient
from .rss_fetcher import fetch_feed, PodcastRefresher

log = logging.getLogger("okaasan.podcasts")

router = APIRouter(prefix="/podcasts", tags=["podcasts"])

_client: PodcastIndexClient | None = None
_refresher: PodcastRefresher | None = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


def _config_path(static_folder: str) -> Path:
    return Path(static_folder) / "private" / "_podcasts.json"


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
    base = Path(static_folder)
    cache_dir = base / "uploads" / "data" / "podcasts" / "metadata_cache"
    covers_dir = base / "uploads" / "data" / "podcasts" / "covers"

    cfg = _load_config(static_folder)
    api_key = cfg.get("api_key", "")
    api_secret = cfg.get("api_secret", "")

    _client = PodcastIndexClient(cache_dir, covers_dir, api_key=api_key, api_secret=api_secret)
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
    """List all subscribed podcasts."""
    podcasts = db.query(Podcast).order_by(Podcast.title).all()
    return [p.to_json() for p in podcasts]


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
        from datetime import datetime, timezone
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
