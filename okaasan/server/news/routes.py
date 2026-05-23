"""API routes for the World News section."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Depends, Query
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from .models import NewsArticle, NewsSource, NewsGroup

log = logging.getLogger("okaasan.news")

router = APIRouter(prefix="/news", tags=["news"])

_news_refresher = None


def _get_db(request: Request):
    yield from request.app.state.get_db()


@router.get("/feed")
def news_feed(
    request: Request,
    db: Session = Depends(_get_db),
    limit: int = Query(60, ge=1, le=200),
    offset: int = Query(0, ge=0),
    source_id: int | None = Query(None),
):
    """Return recent news, with grouped stories merged.

    Articles that belong to a group are returned once per group (the
    earliest article becomes the "primary"), with a ``sources`` array
    listing all articles in that group.
    """
    q = db.query(NewsArticle).order_by(desc(NewsArticle.published_at))
    if source_id is not None:
        q = q.filter(NewsArticle.source_id == source_id)

    articles = q.limit(500).all()

    groups: dict[int, list[dict]] = {}
    standalone: list[dict] = []

    for art in articles:
        j = art.to_json()
        if art.group_id:
            groups.setdefault(art.group_id, []).append(j)
        else:
            standalone.append(j)

    result = []

    for gid, group_articles in groups.items():
        group_articles.sort(key=lambda a: a["published_at"] or "")
        primary = dict(group_articles[0])
        primary["sources"] = group_articles
        primary["source_count"] = len(group_articles)
        primary["is_grouped"] = True
        result.append(primary)

    for art in standalone:
        art["sources"] = [dict(art)]
        art["source_count"] = 1
        art["is_grouped"] = False
        result.append(art)

    result.sort(key=lambda a: a["published_at"] or "", reverse=True)
    total = len(result)
    page = result[offset:offset + limit]

    return {"items": page, "total": total}


@router.get("/sources")
def news_sources(db: Session = Depends(_get_db)):
    """List all configured news sources."""
    sources = db.query(NewsSource).order_by(NewsSource.name).all()
    return {"sources": [s.to_json() for s in sources]}


@router.post("/sources")
async def add_news_source(request: Request, db: Session = Depends(_get_db)):
    """Add a new RSS news source."""
    from fastapi import HTTPException

    body = await request.json()
    name = body.get("name", "").strip()
    feed_url = body.get("feed_url", "").strip()
    if not name or not feed_url:
        raise HTTPException(status_code=400, detail="name and feed_url required")

    existing = db.query(NewsSource).filter(NewsSource.feed_url == feed_url).first()
    if existing:
        return existing.to_json()

    source = NewsSource(name=name, feed_url=feed_url)
    db.add(source)
    db.commit()
    return source.to_json()


@router.post("/refresh")
def refresh_news(request: Request):
    """Trigger an immediate news feed refresh."""
    from .rss_fetcher import refresh_all_sources
    from .grouping import group_recent_articles

    SL = request.app.state.SessionLocal
    count = refresh_all_sources(SL)
    grouped = group_recent_articles(SL)
    return {"new_articles": count, "newly_grouped": grouped}


@router.get("/stats")
def news_stats(db: Session = Depends(_get_db)):
    """Basic stats about stored news articles."""
    total = db.query(func.count(NewsArticle.id)).scalar() or 0
    grouped = db.query(func.count(NewsArticle.id)).filter(NewsArticle.group_id.isnot(None)).scalar() or 0
    group_count = db.query(func.count(NewsGroup.id)).scalar() or 0
    source_count = db.query(func.count(NewsSource.id)).scalar() or 0
    return {
        "total_articles": total,
        "grouped_articles": grouped,
        "story_groups": group_count,
        "sources": source_count,
    }


def start_refresher(session_factory):
    """Start the background news refresher (called from server.py)."""
    global _news_refresher
    from .rss_fetcher import NewsRefresher
    _news_refresher = NewsRefresher(session_factory, interval_minutes=15)
    _news_refresher.start()
    return _news_refresher
