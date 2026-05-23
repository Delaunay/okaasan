"""RSS feed fetcher for world news sources."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..task_registry import registry

log = logging.getLogger("okaasan.news.rss")

try:
    import feedparser
    _HAS_FEEDPARSER = True
except ImportError:
    feedparser = None  # type: ignore[assignment]
    _HAS_FEEDPARSER = False
    log.warning("feedparser not installed — news RSS refresh disabled")

import socket
import urllib.request

# Force IPv4 to avoid long IPv6 timeouts on networks without IPv6 connectivity.
_orig_getaddrinfo = socket.getaddrinfo

def _ipv4_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)


class _IPv4HTTPHandler(urllib.request.HTTPHandler):
    def http_open(self, req):
        socket.getaddrinfo = _ipv4_getaddrinfo
        try:
            return super().http_open(req)
        finally:
            socket.getaddrinfo = _orig_getaddrinfo


class _IPv4HTTPSHandler(urllib.request.HTTPSHandler):
    def https_open(self, req):
        socket.getaddrinfo = _ipv4_getaddrinfo
        try:
            return super().https_open(req)
        finally:
            socket.getaddrinfo = _orig_getaddrinfo


_ipv4_opener = urllib.request.build_opener(_IPv4HTTPHandler, _IPv4HTTPSHandler)
_ipv4_opener.addheaders = [("User-Agent", "okaasan-news/1.0")]


DEFAULT_FEEDS = [
    ("BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("AP News", "https://feedx.net/rss/ap.xml"),
    ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
]


def _parse_published(entry: Any) -> datetime | None:
    published = entry.get("published_parsed") or entry.get("updated_parsed")
    if published:
        try:
            return datetime(*published[:6], tzinfo=timezone.utc)
        except (TypeError, ValueError):
            pass
    return None


def _extract_image(entry: Any) -> str | None:
    """Try to extract a thumbnail/image URL from the entry."""
    media = entry.get("media_thumbnail")
    if media and isinstance(media, list) and media[0].get("url"):
        return media[0]["url"]

    media_content = entry.get("media_content")
    if media_content and isinstance(media_content, list):
        for mc in media_content:
            if mc.get("medium") == "image" or (mc.get("type", "").startswith("image/")):
                return mc.get("url")

    links = entry.get("links", [])
    for link in links:
        if link.get("type", "").startswith("image/"):
            return link.get("href")

    return None


def _extract_categories(entry: Any) -> list[str]:
    """Pull category/tag terms from a feed entry."""
    tags = entry.get("tags", [])
    return [t.get("term") or t.get("label", "") for t in tags if t.get("term") or t.get("label")]


def fetch_news_feed(feed_url: str) -> list[dict]:
    """Parse a news RSS feed and return article dicts."""
    if not _HAS_FEEDPARSER:
        return []

    xml = _ipv4_opener.open(feed_url, timeout=15).read()
    feed = feedparser.parse(xml)
    articles = []

    for entry in feed.entries:
        guid = entry.get("id") or entry.get("link") or entry.get("title", "")
        url = entry.get("link", "")

        articles.append({
            "title": entry.get("title", "Untitled"),
            "description": entry.get("summary") or entry.get("description", ""),
            "url": url,
            "image_url": _extract_image(entry),
            "published_at": _parse_published(entry),
            "guid": guid,
            "categories": _extract_categories(entry),
        })

    return articles


_FEED_MIGRATIONS = {
    "https://rsshub.app/apnews/topics/world-news": "https://feedx.net/rss/ap.xml",
}


def ensure_default_sources(session_factory) -> None:
    """Create the default news sources if they don't exist."""
    from .models import NewsSource

    db: Session = session_factory()
    try:
        for old_url, new_url in _FEED_MIGRATIONS.items():
            src = db.query(NewsSource).filter(NewsSource.feed_url == old_url).first()
            if src:
                src.feed_url = new_url

        existing = {row[0] for row in db.query(NewsSource.feed_url).all()}
        for name, url in DEFAULT_FEEDS:
            if url not in existing:
                db.add(NewsSource(name=name, feed_url=url))
        db.commit()
    finally:
        db.close()


def refresh_all_sources(session_factory) -> int:
    """Fetch all enabled news sources and insert new articles. Returns count."""
    from .models import NewsSource, NewsArticle

    db: Session = session_factory()
    new_count = 0
    try:
        sources = db.query(NewsSource).filter(NewsSource.enabled == True).all()  # noqa: E712
        for source in sources:
            try:
                articles = fetch_news_feed(source.feed_url)
                existing_guids = set(
                    row[0] for row in
                    db.query(NewsArticle.guid)
                    .filter(NewsArticle.source_id == source.id)
                    .all()
                )
                for art in articles:
                    if art["guid"] in existing_guids:
                        continue
                    cats = art.get("categories", [])
                    db.add(NewsArticle(
                        source_id=source.id,
                        source_name=source.name,
                        title=art["title"],
                        description=art["description"],
                        url=art["url"],
                        image_url=art["image_url"],
                        published_at=art["published_at"],
                        guid=art["guid"],
                        categories="|".join(cats) if cats else None,
                    ))
                    new_count += 1
                source.last_fetched_at = datetime.now(timezone.utc)
                db.commit()
            except Exception as e:
                log.warning("Failed to fetch news from %s: %s", source.feed_url, e)
                db.rollback()
    finally:
        db.close()

    if new_count:
        log.info("News refresh: %d new articles", new_count)
    return new_count


class NewsRefresher:
    """Background thread that periodically fetches news RSS feeds."""

    def __init__(self, session_factory, interval_minutes: int = 15):
        self._session_factory = session_factory
        self._interval = interval_minutes * 60
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        ensure_default_sources(self._session_factory)
        registry.register("news_refresh", "News Feed")
        self._thread = threading.Thread(target=self._run, daemon=True, name="news-refresher")
        self._thread.start()
        log.info("News refresher started (interval=%dm)", self._interval // 60)

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        registry.unregister("news_refresh")
        log.info("News refresher stopped")

    def refresh_now(self) -> int:
        return refresh_all_sources(self._session_factory)

    def _run(self):
        time.sleep(5)
        while not self._stop_event.is_set():
            registry.update("news_refresh", status="running", detail="Fetching feeds...")
            try:
                count = refresh_all_sources(self._session_factory)
                from .grouping import group_recent_articles
                grouped = group_recent_articles(self._session_factory)
                detail = f"{count} new" if count else "up to date"
                if grouped:
                    detail += f", {grouped} grouped"
                registry.update("news_refresh", status="idle", detail=detail)
            except Exception as e:
                log.error("News refresh error: %s", e)
                registry.update("news_refresh", status="error", error=str(e))
            self._stop_event.wait(self._interval)
