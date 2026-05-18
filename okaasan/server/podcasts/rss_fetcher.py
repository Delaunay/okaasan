"""RSS feed parser and background refresh for podcast subscriptions."""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..task_registry import registry

log = logging.getLogger("okaasan.podcasts.rss")

try:
    import feedparser
    _HAS_FEEDPARSER = True
except ImportError:
    feedparser = None  # type: ignore[assignment]
    _HAS_FEEDPARSER = False
    log.warning("feedparser not installed — RSS refresh disabled")


def _parse_duration(value: str | None) -> int | None:
    """Parse iTunes duration (HH:MM:SS or seconds) to milliseconds."""
    if not value:
        return None
    try:
        parts = value.split(":")
        if len(parts) == 3:
            h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
            return (h * 3600 + m * 60 + s) * 1000
        if len(parts) == 2:
            m, s = int(parts[0]), int(parts[1])
            return (m * 60 + s) * 1000
        return int(float(value)) * 1000
    except (ValueError, TypeError):
        return None


def _parse_published(entry: Any) -> datetime | None:
    """Extract published date from a feedparser entry."""
    if not _HAS_FEEDPARSER:
        return None
    published = entry.get("published_parsed") or entry.get("updated_parsed")
    if published:
        try:
            return datetime(*published[:6], tzinfo=timezone.utc)
        except (TypeError, ValueError):
            pass
    return None


def fetch_feed(feed_url: str) -> list[dict]:
    """Parse an RSS feed and return a list of episode dicts."""
    if not _HAS_FEEDPARSER:
        return []

    feed = feedparser.parse(feed_url)
    episodes: list[dict] = []

    for entry in feed.entries:
        audio_url = None
        for link in entry.get("links", []):
            if link.get("type", "").startswith("audio/") or link.get("rel") == "enclosure":
                audio_url = link.get("href")
                break
        if not audio_url:
            enclosures = entry.get("enclosures", [])
            if enclosures:
                audio_url = enclosures[0].get("href")

        guid = entry.get("id") or entry.get("link") or entry.get("title", "")
        duration_raw = entry.get("itunes_duration") or entry.get("duration")

        episodes.append({
            "title": entry.get("title", "Untitled"),
            "description": entry.get("summary") or entry.get("description", ""),
            "audio_url": audio_url,
            "duration_ms": _parse_duration(duration_raw),
            "published_at": _parse_published(entry),
            "episode_number": _safe_int(entry.get("itunes_episode")),
            "season_number": _safe_int(entry.get("itunes_season")),
            "guid": guid,
        })

    return episodes


def _safe_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def refresh_all_feeds(session_factory) -> int:
    """Iterate all subscribed podcasts and fetch new episodes. Returns count of new episodes."""
    from .models import Podcast, PodcastEpisode

    db: Session = session_factory()
    new_count = 0
    try:
        podcasts = db.query(Podcast).all()
        for podcast in podcasts:
            try:
                episodes_data = fetch_feed(podcast.feed_url)
                existing_guids = set(
                    row[0] for row in
                    db.query(PodcastEpisode.guid)
                    .filter(PodcastEpisode.podcast_id == podcast.id)
                    .all()
                )
                for ep_data in episodes_data:
                    if ep_data["guid"] in existing_guids:
                        continue
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
                    new_count += 1

                podcast.last_fetched_at = datetime.now(timezone.utc)
                db.commit()
            except Exception as e:
                log.warning("Failed to refresh feed %s: %s", podcast.feed_url, e)
                db.rollback()
    finally:
        db.close()

    if new_count:
        log.info("RSS refresh complete: %d new episodes", new_count)
    return new_count


class PodcastRefresher:
    """Background thread that periodically refreshes podcast feeds."""

    def __init__(self, session_factory, interval_minutes: int = 30):
        self._session_factory = session_factory
        self._interval = interval_minutes * 60
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        registry.register("podcast_refresh", "Podcast Refresh")
        self._thread = threading.Thread(target=self._run, daemon=True, name="podcast-refresher")
        self._thread.start()
        log.info("Podcast refresher started (interval=%dm)", self._interval // 60)

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        log.info("Podcast refresher stopped")

    def refresh_now(self) -> int:
        """Trigger an immediate refresh (blocking)."""
        return refresh_all_feeds(self._session_factory)

    def _run(self):
        time.sleep(10)
        while not self._stop_event.is_set():
            registry.update("podcast_refresh", status="running", detail="Refreshing feeds...")
            try:
                count = refresh_all_feeds(self._session_factory)
                registry.update("podcast_refresh", status="idle", detail=f"{count} new episodes" if count else "")
            except Exception as e:
                log.error("Podcast refresh loop error: %s", e)
                registry.update("podcast_refresh", status="error", error=str(e))
            self._stop_event.wait(self._interval)
