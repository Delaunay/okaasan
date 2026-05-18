"""User-defined collections/playlists of shows and movies."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger("okaasan.shows.collections")


class CollectionManager:
    """Manages user-created playlists/collections stored as JSON files."""

    def __init__(self, data_dir: Path):
        self.collections_dir = data_dir / "uploads" / "data" / "shows" / "collections"
        self.collections_dir.mkdir(parents=True, exist_ok=True)

    def _collection_path(self, collection_id: str) -> Path:
        safe_id = collection_id.replace("/", "_").replace("..", "_")
        return self.collections_dir / f"{safe_id}.json"

    def list_collections(self) -> list[dict]:
        """Return all collection summaries."""
        collections = []
        for f in sorted(self.collections_dir.glob("*.json")):
            try:
                with open(f) as fh:
                    data = json.load(fh)
                collections.append({
                    "id": f.stem,
                    "name": data.get("name", f.stem),
                    "description": data.get("description", ""),
                    "item_count": len(data.get("items", [])),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                    "cover_image": data.get("cover_image"),
                })
            except (json.JSONDecodeError, OSError):
                continue
        return collections

    def get_collection(self, collection_id: str) -> dict | None:
        path = self._collection_path(collection_id)
        if not path.exists():
            return None
        with open(path) as f:
            data = json.load(f)
        data["id"] = collection_id
        return data

    def create_collection(self, data: dict) -> dict:
        import time
        collection_id = data.get("id") or data["name"].lower().replace(" ", "-")
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

        collection = {
            "name": data["name"],
            "description": data.get("description", ""),
            "items": data.get("items", []),
            "created_at": now,
            "updated_at": now,
            "cover_image": data.get("cover_image"),
        }

        path = self._collection_path(collection_id)
        with open(path, "w") as f:
            json.dump(collection, f, indent=2)

        collection["id"] = collection_id
        return collection

    def update_collection(self, collection_id: str, data: dict) -> dict | None:
        import time
        existing = self.get_collection(collection_id)
        if existing is None:
            return None

        if "name" in data:
            existing["name"] = data["name"]
        if "description" in data:
            existing["description"] = data["description"]
        if "items" in data:
            existing["items"] = data["items"]
        if "cover_image" in data:
            existing["cover_image"] = data["cover_image"]

        existing["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        existing.pop("id", None)

        path = self._collection_path(collection_id)
        with open(path, "w") as f:
            json.dump(existing, f, indent=2)

        existing["id"] = collection_id
        return existing

    def delete_collection(self, collection_id: str) -> bool:
        path = self._collection_path(collection_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def add_item(self, collection_id: str, item: dict) -> dict | None:
        """Add a show/movie to a collection."""
        import time
        collection = self.get_collection(collection_id)
        if collection is None:
            return None

        items = collection.get("items", [])
        item_key = f"{item.get('type')}-{item.get('tmdb_id') or item.get('trakt_id')}"
        if any(
            f"{i.get('type')}-{i.get('tmdb_id') or i.get('trakt_id')}" == item_key
            for i in items
        ):
            return collection

        items.append(item)
        collection["items"] = items
        collection["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        collection.pop("id", None)

        path = self._collection_path(collection_id)
        with open(path, "w") as f:
            json.dump(collection, f, indent=2)

        collection["id"] = collection_id
        return collection

    def remove_item(self, collection_id: str, item_type: str, tmdb_id: int) -> dict | None:
        """Remove a show/movie from a collection."""
        import time
        collection = self.get_collection(collection_id)
        if collection is None:
            return None

        items = collection.get("items", [])
        collection["items"] = [
            i for i in items
            if not (i.get("type") == item_type and i.get("tmdb_id") == tmdb_id)
        ]
        collection["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        collection.pop("id", None)

        path = self._collection_path(collection_id)
        with open(path, "w") as f:
            json.dump(collection, f, indent=2)

        collection["id"] = collection_id
        return collection
