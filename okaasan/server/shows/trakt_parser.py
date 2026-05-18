"""Parse Trakt.tv data dump files into normalized structures."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger("okaasan.shows")


def _load_json(path: Path) -> Any:
    if not path.exists():
        return []
    with open(path) as f:
        return json.load(f)


def _load_multi_json(folder: Path, prefix: str) -> list:
    """Load multiple numbered JSON files (e.g. watched-history-1.json ... watched-history-12.json)."""
    items = []
    idx = 1
    while True:
        p = folder / f"{prefix}-{idx}.json"
        if not p.exists():
            break
        items.extend(_load_json(p))
        idx += 1
    return items


class TraktData:
    """Loads and provides access to parsed Trakt.tv export data."""

    def __init__(self, shows_dir: Path):
        self.shows_dir = shows_dir
        self._cache: dict[str, Any] = {}

    def _get(self, key: str, loader):
        if key not in self._cache:
            self._cache[key] = loader()
        return self._cache[key]

    @property
    def watchlist(self) -> list[dict]:
        return self._get("watchlist", lambda: _load_json(self.shows_dir / "lists-watchlist.json"))

    @property
    def favorites(self) -> list[dict]:
        return self._get("favorites", lambda: _load_json(self.shows_dir / "lists-favorites.json"))

    @property
    def watched_shows(self) -> list[dict]:
        return self._get("watched_shows", lambda: _load_json(self.shows_dir / "watched-shows.json"))

    @property
    def watched_movies(self) -> list[dict]:
        def _load():
            items = []
            idx = 1
            while True:
                p = self.shows_dir / f"watched-movies-{idx}.json"
                if not p.exists():
                    break
                items.extend(_load_json(p))
                idx += 1
            return items
        return self._get("watched_movies", _load)

    @property
    def history(self) -> list[dict]:
        return self._get("history", lambda: _load_multi_json(self.shows_dir, "watched-history"))

    @property
    def ratings_shows(self) -> list[dict]:
        return self._get("ratings_shows", lambda: _load_json(self.shows_dir / "ratings-shows.json"))

    @property
    def ratings_movies(self) -> list[dict]:
        return self._get("ratings_movies", lambda: _load_json(self.shows_dir / "ratings-movies.json"))

    @property
    def ratings_episodes(self) -> list[dict]:
        return self._get("ratings_episodes", lambda: _load_json(self.shows_dir / "ratings-episodes.json"))

    @property
    def collection_shows(self) -> list[dict]:
        return self._get("collection_shows", lambda: _load_json(self.shows_dir / "collection-shows.json"))

    @property
    def collection_movies(self) -> list[dict]:
        return self._get("collection_movies", lambda: _load_json(self.shows_dir / "collection-movies.json"))

    @property
    def collection_episodes(self) -> list[dict]:
        return self._get("collection_episodes", lambda: _load_json(self.shows_dir / "collection-episodes.json"))

    @property
    def user_stats(self) -> dict:
        return self._get("user_stats", lambda: _load_json(self.shows_dir / "user-stats.json"))

    def invalidate(self):
        self._cache.clear()

    def get_overview(self) -> dict:
        """Build overview data: recently watched, next in watchlist, etc."""
        recently_watched = []
        seen_ids: set[str] = set()

        for item in self.history[:200]:
            media_type = item.get("type")
            if media_type == "episode":
                show = item.get("show", {})
                key = f"show-{show.get('ids', {}).get('trakt')}"
            elif media_type == "movie":
                movie = item.get("movie", {})
                key = f"movie-{movie.get('ids', {}).get('trakt')}"
            else:
                continue

            if key in seen_ids:
                continue
            seen_ids.add(key)
            recently_watched.append(item)
            if len(recently_watched) >= 12:
                break

        watchlist_items = self.watchlist[:10]

        return {
            "recently_watched": recently_watched,
            "watchlist_next": watchlist_items,
            "stats_summary": self.user_stats,
        }

    def get_history_page(self, page: int = 1, per_page: int = 50, media_type: str | None = None) -> dict:
        """Return paginated history, optionally filtered by type."""
        items = self.history
        if media_type:
            items = [i for i in items if i.get("type") == media_type]

        total = len(items)
        start = (page - 1) * per_page
        end = start + per_page

        return {
            "items": items[start:end],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page,
        }

    def get_watchlist_items(self) -> list[dict]:
        return self.watchlist

    def get_stats(self) -> dict:
        """Build comprehensive stats."""
        ratings_map: dict[int, int] = {}
        for r in self.ratings_shows + self.ratings_movies:
            val = r.get("rating", 0)
            ratings_map[val] = ratings_map.get(val, 0) + 1

        genres: dict[str, int] = {}
        countries: dict[str, int] = {}

        for m in self.watched_movies:
            movie = m.get("movie", {})
            for g in movie.get("genres", []):
                genres[g] = genres.get(g, 0) + 1
            country = movie.get("country")
            if country:
                countries[country] = countries.get(country, 0) + 1

        for s in self.watched_shows:
            show = s.get("show", {})
            for g in show.get("genres", []):
                genres[g] = genres.get(g, 0) + 1
            country = show.get("country")
            if country:
                countries[country] = countries.get(country, 0) + 1

        top_genres = sorted(genres.items(), key=lambda x: x[1], reverse=True)[:15]
        top_countries = sorted(countries.items(), key=lambda x: x[1], reverse=True)[:20]

        return {
            "user_stats": self.user_stats,
            "total_shows_watched": len(self.watched_shows),
            "total_movies_watched": len(self.watched_movies),
            "ratings_distribution": ratings_map,
            "top_genres": top_genres,
            "top_countries": top_countries,
            "total_ratings": len(self.ratings_shows) + len(self.ratings_movies),
        }

    def get_favorites(self) -> list[dict]:
        """Return favorites list formatted for display."""
        return self.favorites

    def get_trakt_collection(self) -> dict:
        """Return the user's Trakt collection (owned/collected media)."""
        shows = self.collection_shows
        movies = self.collection_movies
        episodes = self.collection_episodes

        # Group episodes by show for a cleaner view
        episodes_by_show: dict[int, dict] = {}
        for ep in episodes:
            show = ep.get("show", {})
            trakt_id = show.get("ids", {}).get("trakt")
            if not trakt_id:
                continue
            if trakt_id not in episodes_by_show:
                episodes_by_show[trakt_id] = {
                    "show": show,
                    "episodes": [],
                    "collected_at": ep.get("collected_at"),
                }
            episodes_by_show[trakt_id]["episodes"].append({
                "title": ep.get("episode", {}).get("title"),
                "season": ep.get("episode", {}).get("season"),
                "number": ep.get("episode", {}).get("number"),
                "collected_at": ep.get("collected_at"),
            })

        return {
            "shows": shows,
            "movies": movies,
            "episodes_by_show": list(episodes_by_show.values()),
            "total_shows": len(shows),
            "total_movies": len(movies),
            "total_episodes": len(episodes),
        }

    def get_all_media_ids(self) -> dict:
        """Collect all unique TMDB IDs for pre-fetching metadata."""
        tmdb_ids: dict[str, set[int]] = {"show": set(), "movie": set()}

        for item in self.watchlist + self.favorites:
            if item.get("type") == "show" and item.get("show", {}).get("ids", {}).get("tmdb"):
                tmdb_ids["show"].add(item["show"]["ids"]["tmdb"])
            elif item.get("type") == "movie" and item.get("movie", {}).get("ids", {}).get("tmdb"):
                tmdb_ids["movie"].add(item["movie"]["ids"]["tmdb"])

        for item in self.watched_shows:
            tid = item.get("show", {}).get("ids", {}).get("tmdb")
            if tid:
                tmdb_ids["show"].add(tid)

        for item in self.watched_movies:
            tid = item.get("movie", {}).get("ids", {}).get("tmdb")
            if tid:
                tmdb_ids["movie"].add(tid)

        return {k: list(v) for k, v in tmdb_ids.items()}
