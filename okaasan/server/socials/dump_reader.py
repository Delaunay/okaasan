"""Explore and read social media platform data dumps."""
from __future__ import annotations

import csv
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

log = logging.getLogger("okaasan.socials")

SKIP_DIRS = {".git", "__MACOSX", "node_modules"}
MAX_PREVIEW_LEN = 200
MAX_FILE_SIZE = 100 * 1024 * 1024

# Collapse deep export trees into browseable groups (longest prefix first).
_GROUP_PREFIXES: dict[str, list[str]] = {
    "facebook": [
        "your_facebook_activity/messages",
        "your_facebook_activity/posts",
        "your_facebook_activity/photos_and_videos",
        "your_facebook_activity/comments",
        "your_facebook_activity/likes_and_reactions",
        "your_facebook_activity/groups",
        "your_facebook_activity/events",
        "your_facebook_activity/saved_items_and_collections",
        "your_facebook_activity/pages",
        "your_facebook_activity/facebook_gaming",
        "your_facebook_activity/facebook_marketplace",
        "connections/friends",
        "connections/followers",
        "logged_information/interactions",
        "logged_information/search",
    ],
    "instagram": [
        "your_instagram_activity/messages",
        "your_instagram_activity/media",
        "your_instagram_activity/comments",
        "your_instagram_activity/likes",
        "your_instagram_activity/story_interactions",
        "your_instagram_activity/saved",
        "connections/followers_and_following",
        "connections/contacts",
    ],
    "linkedin": [
        "messages",
        "Shares",
        "Connections",
        "Invitations",
        "Profile",
    ],
}

_CATEGORY_PRIORITY: dict[str, dict[str, int]] = {
    "facebook": {
        "your_facebook_activity/posts": 0,
        "your_facebook_activity/messages": 1,
        "your_facebook_activity/photos_and_videos": 2,
        "your_facebook_activity/comments": 3,
        "connections/friends": 4,
        "connections/followers": 5,
        "your_facebook_activity/likes_and_reactions": 6,
        "your_facebook_activity/groups": 7,
        "your_facebook_activity/events": 8,
    },
    "instagram": {
        "your_instagram_activity/media": 0,
        "your_instagram_activity/messages": 1,
        "your_instagram_activity/comments": 2,
        "connections/followers_and_following": 3,
        "your_instagram_activity/likes": 4,
        "your_instagram_activity/story_interactions": 5,
    },
}

_CATEGORY_LABELS: dict[str, dict[str, str]] = {
    "facebook": {
        "your_facebook_activity/posts": "Posts",
        "your_facebook_activity/messages": "Messages",
        "your_facebook_activity/photos_and_videos": "Photos & Videos",
        "your_facebook_activity/comments": "Comments",
        "your_facebook_activity/likes_and_reactions": "Likes & Reactions",
        "your_facebook_activity/groups": "Groups",
        "your_facebook_activity/events": "Events",
        "connections/friends": "Friends",
        "connections/followers": "Followers",
        "logged_information/interactions": "Interactions",
        "logged_information/search": "Search History",
        "logged_information/activity_messages": "Activity Messages",
        "logged_information/in-app_messages": "In-App Messages",
    },
    "instagram": {
        "your_instagram_activity/media": "Posts & Media",
        "your_instagram_activity/messages": "Messages",
        "your_instagram_activity/comments": "Comments",
        "your_instagram_activity/likes": "Likes",
        "your_instagram_activity/story_interactions": "Story Interactions",
        "connections/followers_and_following": "Followers & Following",
        "connections/contacts": "Contacts",
    },
}


def _item_id(file_path: Path, index: int) -> str:
    raw = f"{file_path}:{index}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _is_message_thread(data: dict) -> bool:
    return "participants" in data and isinstance(data.get("messages"), list)


def _preview_message_thread(data: dict) -> str:
    title = (data.get("title") or "").strip()
    participants = data.get("participants") or []
    names = [p.get("name", "") for p in participants[:3] if isinstance(p, dict) and p.get("name")]
    msgs = data.get("messages") or []
    msg_count = len(msgs)
    last_content = ""
    for msg in reversed(msgs):
        if isinstance(msg, dict):
            content = msg.get("content") or msg.get("share", {}).get("link", "")
            if isinstance(content, str) and content.strip():
                last_content = content.strip()
                break
    if title:
        base = title
    elif names:
        base = ", ".join(names)
        if len(participants) > 3:
            base += f" +{len(participants) - 3}"
    else:
        base = "Conversation"
    if last_content:
        return f"{base}: {last_content}"[:MAX_PREVIEW_LEN]
    return f"{base} ({msg_count} messages)"[:MAX_PREVIEW_LEN]


def _preview_meta_dict(data: dict) -> str | None:
    if _is_message_thread(data):
        return _preview_message_thread(data)

    for key in ("title", "Title", "ShareCommentary", "Media Description", "Caption", "name", "text", "body"):
        val = data.get(key)
        if isinstance(val, str) and val.strip() and not val.strip().isdigit():
            return val.strip()[:MAX_PREVIEW_LEN]

    for lv in data.get("label_values") or []:
        if not isinstance(lv, dict):
            continue
        label = lv.get("label", "")
        val = lv.get("value")
        if isinstance(val, str) and val.strip() and label not in ("Update time", "Shared", "Media", "Texte"):
            return f"{label}: {val}"[:MAX_PREVIEW_LEN]

    fbid = data.get("fbid")
    if fbid:
        return f"Facebook item {fbid}"

    for att in data.get("attachments") or []:
        if not isinstance(att, dict):
            continue
        for block in att.get("data") or []:
            if not isinstance(block, dict):
                continue
            ext = block.get("external_context") or {}
            if isinstance(ext.get("url"), str):
                return ext["url"][:MAX_PREVIEW_LEN]
            post = block.get("post") or block.get("text") or ""
            if isinstance(post, str) and post.strip():
                return post.strip()[:MAX_PREVIEW_LEN]

    media = data.get("media")
    if isinstance(media, list) and media:
        captions = [
            m.get("title") for m in media
            if isinstance(m, dict) and isinstance(m.get("title"), str) and m["title"].strip()
        ]
        if captions:
            return captions[0][:MAX_PREVIEW_LEN]
        return f"Media post ({len(media)} file{'s' if len(media) != 1 else ''})"

    if isinstance(data.get("content"), str) and data["content"].strip():
        sender = data.get("sender_name", "")
        content = data["content"].strip()
        if sender:
            return f"{sender}: {content}"[:MAX_PREVIEW_LEN]
        return content[:MAX_PREVIEW_LEN]

    for key in ("First Name", "Last Name", "Full Name", "Company", "Position"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:MAX_PREVIEW_LEN]

    return None


def _preview_text(data: Any) -> str:
    if isinstance(data, dict):
        meta = _preview_meta_dict(data)
        if meta:
            return meta
        for v in data.values():
            if isinstance(v, str) and len(v) > 10 and not v.isdigit():
                return v[:MAX_PREVIEW_LEN]
        return json.dumps(data, ensure_ascii=False)[:MAX_PREVIEW_LEN]
    if isinstance(data, str):
        return data[:MAX_PREVIEW_LEN]
    return str(data)[:MAX_PREVIEW_LEN]


def _extract_date(data: Any) -> str | None:
    if not isinstance(data, dict):
        return None

    if _is_message_thread(data):
        msgs = data.get("messages") or []
        for msg in reversed(msgs):
            if isinstance(msg, dict) and isinstance(msg.get("timestamp_ms"), (int, float)):
                return datetime.fromtimestamp(msg["timestamp_ms"] / 1000, tz=timezone.utc).isoformat()

    for key in (
        "creation_timestamp", "timestamp", "Creation Time", "Date", "date",
        "created_at", "Update Time", "First Message Date", "Last Message Date",
        "Connected On", "timestamp_ms",
    ):
        val = data.get(key)
        if val is None:
            continue
        if key == "timestamp_ms" and isinstance(val, (int, float)):
            return datetime.fromtimestamp(val / 1000, tz=timezone.utc).isoformat()
        if isinstance(val, (int, float)):
            try:
                return datetime.fromtimestamp(val, tz=timezone.utc).isoformat()
            except (OSError, ValueError, OverflowError):
                pass
        if isinstance(val, str) and val.strip():
            return val.strip()

    for lv in data.get("label_values") or []:
        if isinstance(lv, dict) and isinstance(lv.get("timestamp_value"), (int, float)):
            try:
                return datetime.fromtimestamp(lv["timestamp_value"], tz=timezone.utc).isoformat()
            except (OSError, ValueError, OverflowError):
                pass

    return None



def _append_media_uri(uris: list[str], uri: Any) -> None:
    if isinstance(uri, str) and uri.strip() and uri not in uris:
        uris.append(uri.strip())


def _extract_media_uris(data: Any) -> list[str]:
    if not isinstance(data, dict):
        return []
    uris: list[str] = []
    for m in data.get("media") or []:
        if isinstance(m, dict):
            _append_media_uri(uris, m.get("uri"))
    for lv in data.get("label_values") or []:
        if not isinstance(lv, dict):
            continue
        for m in lv.get("media") or []:
            if isinstance(m, dict):
                _append_media_uri(uris, m.get("uri"))
    for att in data.get("attachments") or []:
        if not isinstance(att, dict):
            continue
        for block in att.get("data") or []:
            if not isinstance(block, dict):
                continue
            media = block.get("media")
            if isinstance(media, dict):
                _append_media_uri(uris, media.get("uri"))
    for msg in data.get("messages") or []:
        if not isinstance(msg, dict):
            continue
        for key in ("photos", "videos", "gifs", "audio_files", "files"):
            for m in msg.get(key) or []:
                if isinstance(m, dict):
                    _append_media_uri(uris, m.get("uri"))
                elif isinstance(m, str):
                    _append_media_uri(uris, m)
    return uris


def _classify_item(data: Any) -> tuple[str, str | None, int]:
    if not isinstance(data, dict):
        return "record", None, 0
    if _is_message_thread(data):
        return "chat", None, len(data.get("messages") or [])
    uris = _extract_media_uris(data)
    if data.get("title") or data.get("attachments"):
        return "post", uris[0] if uris else None, len(uris)
    if uris:
        return "media", uris[0], len(uris)
    if data.get("label_values"):
        return "record", uris[0] if uris else None, len(uris)
    return "record", None, 0


def _normalize_item(file_path: Path, index: int, data: Any) -> dict:
    item_type, thumbnail_uri, media_count = _classify_item(data)
    return {
        "id": _item_id(file_path, index),
        "file": file_path.name,
        "index": index,
        "preview": _preview_text(data),
        "date": _extract_date(data),
        "item_type": item_type,
        "thumbnail_uri": thumbnail_uri,
        "media_count": media_count,
        "data": data,
    }


def _load_json_file(path: Path) -> list[Any]:
    if path.stat().st_size > MAX_FILE_SIZE:
        log.warning("Skipping large file %s", path)
        return []
    with open(path, encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if _is_message_thread(data):
            return [data]
        for key in ("photos", "posts", "items"):
            nested = data.get(key)
            if isinstance(nested, list):
                return nested
        return [data]
    return []


def _load_csv_file(path: Path) -> list[dict]:
    if path.stat().st_size > MAX_FILE_SIZE:
        return []
    rows: list[dict] = []
    with open(path, encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(dict(row))
    return rows


def _group_category(platform: str, rel_parent: str) -> str:
    for prefix in _GROUP_PREFIXES.get(platform, []):
        if rel_parent == prefix or rel_parent.startswith(prefix + "/"):
            return prefix
    parts = rel_parent.split("/")
    if len(parts) > 2:
        return "/".join(parts[:2])
    return rel_parent


def _category_label(platform: str, path: str) -> str:
    if path in _CATEGORY_LABELS.get(platform, {}):
        return _CATEGORY_LABELS[platform][path]
    parts = path.split("/")
    if len(parts) >= 2:
        return " / ".join(p.replace("_", " ").replace("-", " ").title() for p in parts[-2:])
    return parts[-1].replace("_", " ").replace("-", " ").title() if parts else path


def _preview_quality(preview: str) -> int:
    if not preview:
        return 0
    if preview.startswith(("{", "[")):
        return 0
    low = preview.lower()
    if low.endswith(": 0") or low in ("montant collecté: 0", "montant collectã©: 0"):
        return 0
    if preview.startswith(("Facebook item ", "Media post (", "Conversation (")):
        return 1
    return 2


def _category_sort_key(platform: str, path: str) -> tuple:
    priority = _CATEGORY_PRIORITY.get(platform, {}).get(path, 100)
    return (priority, path)


class DumpExplorer:
    """Lazy loader for JSON/CSV files inside a platform export folder."""

    def __init__(self, root: Path, platform: str):
        self.root = root
        self.platform = platform
        self._category_cache: dict[str, list[Path]] | None = None
        self._item_count_cache: dict[str, int] | None = None

    def is_available(self) -> bool:
        return self.root.is_dir()

    def _build_category_index(self) -> dict[str, list[Path]]:
        if self._category_cache is not None:
            return self._category_cache
        categories: dict[str, list[Path]] = {}
        for f in self.root.rglob("*"):
            if not f.is_file():
                continue
            if any(part in SKIP_DIRS for part in f.parts):
                continue
            if f.suffix.lower() not in (".json", ".csv"):
                continue
            try:
                rel_parent = f.parent.relative_to(self.root)
                rel_str = "(root)" if str(rel_parent) == "." else str(rel_parent).replace("\\", "/")
            except ValueError:
                continue
            key = _group_category(self.platform, rel_str)
            categories.setdefault(key, []).append(f)
        self._category_cache = categories
        return categories

    def invalidate(self) -> None:
        self._category_cache = None
        self._item_count_cache = None

    def _count_items(self, files: list[Path]) -> int:
        total = 0
        for fpath in files:
            try:
                if fpath.suffix.lower() == ".json":
                    total += len(_load_json_file(fpath))
                else:
                    total += len(_load_csv_file(fpath))
            except Exception as exc:
                log.warning("Failed to count %s: %s", fpath, exc)
        return total

    def get_categories(self) -> list[dict]:
        cats = self._build_category_index()
        if self._item_count_cache is None:
            self._item_count_cache = {path: self._count_items(files) for path, files in cats.items()}
        return [
            {
                "path": path,
                "file_count": len(files),
                "item_count": self._item_count_cache.get(path, 0),
                "label": _category_label(self.platform, path),
            }
            for path, files in sorted(cats.items(), key=lambda kv: _category_sort_key(self.platform, kv[0]))
        ]

    def _iter_records(self, files: list[Path]) -> Iterator[tuple[Path, int, Any]]:
        for fpath in sorted(files):
            try:
                if fpath.suffix.lower() == ".json":
                    records = _load_json_file(fpath)
                else:
                    records = _load_csv_file(fpath)
                for i, rec in enumerate(records):
                    yield fpath, i, rec
            except Exception as exc:
                log.warning("Failed to read %s: %s", fpath, exc)

    def load_items(
        self,
        category: str,
        page: int = 1,
        per_page: int = 50,
        search: str | None = None,
    ) -> dict:
        cats = self._build_category_index()
        files = cats.get(category, [])
        all_items: list[dict] = []
        search_lower = search.lower() if search else None

        for fpath, i, rec in self._iter_records(files):
            if search_lower:
                hay = json.dumps(rec, ensure_ascii=False).lower()
                if search_lower not in hay:
                    continue
            item = _normalize_item(fpath, i, rec)
            item["category"] = category
            item["file_path"] = str(fpath.relative_to(self.root))
            all_items.append({k: v for k, v in item.items() if k != "data"})

        all_items.sort(
            key=lambda x: (
                _preview_quality(x.get("preview") or ""),
                x.get("date") or "",
            ),
            reverse=True,
        )
        total = len(all_items)
        start = (page - 1) * per_page
        end = start + per_page
        return {
            "items": all_items[start:end],
            "total": total,
            "page": page,
            "per_page": per_page,
            "category": category,
        }

    def get_item(self, category: str, item_id: str) -> dict | None:
        cats = self._build_category_index()
        files = cats.get(category, [])
        for fpath, i, rec in self._iter_records(files):
            if _item_id(fpath, i) == item_id:
                item = _normalize_item(fpath, i, rec)
                item["category"] = category
                item["file_path"] = str(fpath.relative_to(self.root))
                return item
        return None
