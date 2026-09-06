from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    BigInteger,
    DateTime,
    Boolean,
    JSON,
    Index,
)
from sqlalchemy.orm import declarative_base

DiscoverBase = declarative_base()


class SearchResult(DiscoverBase):
    """Cached torrent search result from pyackett indexers."""

    __tablename__ = "search_results"

    id = Column(Integer, primary_key=True)
    title = Column(String(1000), nullable=False)
    infohash = Column(String(64), nullable=True, index=True)
    magnet = Column(String(4000), nullable=True)
    download_url = Column(String(4000), nullable=True)
    seeders = Column(Integer, nullable=True)
    leechers = Column(Integer, nullable=True)
    size = Column(BigInteger, nullable=True)
    category = Column(String(100), nullable=True)
    indexer = Column(String(100), nullable=True)
    indexer_id = Column(String(100), nullable=True)
    details_url = Column(String(4000), nullable=True)
    published_at = Column(DateTime, nullable=True)
    searched_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    query = Column(String(500), nullable=True, index=True)
    # Normalized form of `query` (lowercased/trimmed/whitespace-collapsed) plus
    # the sorted, comma-joined torznab category codes used for that search —
    # both populated at cache-write time so a later search can cheaply check
    # "did we already search this recently" without re-hitting indexers.
    query_normalized = Column(String(500), nullable=True, index=True)
    searched_categories = Column(String(100), nullable=True)

    __table_args__ = (
        Index("ix_search_query_title", "query", "title"),
    )

    def to_json(self):
        return {
            "id": self.id,
            "title": self.title,
            "infohash": self.infohash,
            "magnet": self.magnet,
            "download_url": self.download_url,
            "seeders": self.seeders,
            "leechers": self.leechers,
            "size": self.size,
            "category": self.category,
            "indexer": self.indexer,
            "indexer_id": self.indexer_id,
            "details_url": self.details_url,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "searched_at": self.searched_at.isoformat() if self.searched_at else None,
            "query": self.query,
        }


class DHTTorrent(DiscoverBase):
    """Torrent discovered via DHT crawling (BEP 51 sample_infohashes)."""

    __tablename__ = "dht_torrents"

    id = Column(Integer, primary_key=True)
    infohash = Column(String(40), nullable=False, unique=True, index=True)
    name = Column(String(1000), nullable=True)
    size = Column(BigInteger, nullable=True)
    files_count = Column(Integer, nullable=True)
    files_json = Column(JSON, nullable=True)
    raw_metadata = Column(JSON, nullable=True)
    peers_count = Column(Integer, nullable=True)
    hits = Column(Integer, default=1)
    resolve_attempts = Column(Integer, default=0)
    metadata_resolved = Column(Boolean, default=False)
    discovered_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    @property
    def magnet(self) -> str:
        uri = f"magnet:?xt=urn:btih:{self.infohash}"
        if self.name:
            from urllib.parse import quote
            uri += f"&dn={quote(self.name)}"
        return uri

    def to_json(self, include_detail: bool = False):
        data = {
            "id": self.id,
            "infohash": self.infohash,
            "name": self.name,
            "size": self.size,
            "files_count": self.files_count,
            "peers_count": self.peers_count,
            "hits": self.hits,
            "magnet": self.magnet,
            "metadata_resolved": self.metadata_resolved,
            "discovered_at": self.discovered_at.isoformat() if self.discovered_at else None,
        }
        if include_detail:
            if self.files_json:
                data["files"] = self.files_json
            if self.raw_metadata:
                data["raw_metadata"] = self.raw_metadata
        return data


class DownloadedRelease(DiscoverBase):
    """A release the user has downloaded (file link opened, or added to
    qBittorrent) — used to filter already-grabbed episodes/movies out of
    future search results."""

    __tablename__ = "downloaded_releases"

    id = Column(Integer, primary_key=True)
    infohash = Column(String(64), nullable=True, index=True)
    normalized_title = Column(String(500), nullable=True, index=True)
    season = Column(Integer, nullable=True)
    episode = Column(Integer, nullable=True)
    title = Column(String(1000), nullable=False)
    action = Column(String(20), nullable=False)  # "download_file" | "add_qbittorrent"
    downloaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("ix_downloaded_title_season_episode", "normalized_title", "season", "episode"),
    )

    def to_json(self):
        return {
            "id": self.id,
            "infohash": self.infohash,
            "normalized_title": self.normalized_title,
            "season": self.season,
            "episode": self.episode,
        }


class IndexerConfig(DiscoverBase):
    """Per-indexer configuration for pyackett."""

    __tablename__ = "indexer_configs"

    id = Column(Integer, primary_key=True)
    indexer_id = Column(String(100), nullable=False, unique=True, index=True)
    enabled = Column(Boolean, default=True)
    config = Column(JSON, default=dict)

    def to_json(self):
        return {
            "id": self.id,
            "indexer_id": self.indexer_id,
            "enabled": self.enabled,
            "config": self.config,
        }
