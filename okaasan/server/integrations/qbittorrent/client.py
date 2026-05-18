"""Thin wrapper around the qbittorrentapi package."""
from __future__ import annotations

import logging
from typing import Any

import qbittorrentapi

log = logging.getLogger("okaasan.qbittorrent.client")


class QBitClient:
    """Manages a connection to a running qBittorrent Web API instance."""

    def __init__(self, host: str = "localhost", port: int = 8080,
                 username: str = "admin", password: str = "adminadmin"):
        self._conn_info = dict(host=host, port=port,
                               username=username, password=password)
        self._client: qbittorrentapi.Client | None = None

    def _get_client(self) -> qbittorrentapi.Client:
        if self._client is None:
            self._client = qbittorrentapi.Client(**self._conn_info)
        try:
            self._client.auth_log_in()
        except qbittorrentapi.LoginFailed:
            log.warning("qBittorrent login failed — check credentials")
            raise
        return self._client

    def update_credentials(self, host: str, port: int,
                           username: str, password: str) -> None:
        self._conn_info = dict(host=host, port=port,
                               username=username, password=password)
        self._client = None

    # ── Torrent operations ────────────────────────────────────────────

    def list_torrents(self, **kwargs) -> list[dict]:
        c = self._get_client()
        return [t.info for t in c.torrents_info(**kwargs)]

    def add_torrent(self, urls: str | None = None,
                    torrent_files: Any = None,
                    category: str | None = None,
                    save_path: str | None = None,
                    tags: str | None = None) -> str:
        c = self._get_client()
        result = c.torrents_add(
            urls=urls,
            torrent_files=torrent_files,
            category=category,
            save_path=save_path,
            tags=tags,
        )
        return result

    def remove_torrent(self, torrent_hash: str, delete_files: bool = False) -> None:
        c = self._get_client()
        c.torrents_delete(delete_files=delete_files, torrent_hashes=torrent_hash)

    def pause_torrent(self, torrent_hash: str) -> None:
        c = self._get_client()
        c.torrents_stop(torrent_hashes=torrent_hash)

    def resume_torrent(self, torrent_hash: str) -> None:
        c = self._get_client()
        c.torrents_start(torrent_hashes=torrent_hash)

    def get_torrent(self, torrent_hash: str) -> dict | None:
        c = self._get_client()
        try:
            torrents = c.torrents_info(torrent_hashes=torrent_hash)
            if torrents:
                return torrents[0].info
        except Exception:
            pass
        return None

    # ── Transfer / global info ────────────────────────────────────────

    def get_transfer_info(self) -> dict:
        c = self._get_client()
        info = c.transfer_info()
        return dict(info)

    def get_version(self) -> str | None:
        try:
            c = self._get_client()
            return c.app.version
        except Exception:
            return None

    # ── Category management ───────────────────────────────────────────

    def sync_categories(self, destinations: dict[str, str]) -> None:
        """Ensure qBittorrent categories exist with the given save paths.

        destinations maps category name -> save path, e.g.
        {"tv": "/media/shows", "movie": "/media/movies", "music": "/media/music"}
        """
        c = self._get_client()
        existing = c.torrents_categories()

        for cat_name, save_path in destinations.items():
            if cat_name in existing:
                current = existing[cat_name]
                if current.get("savePath", "") != save_path:
                    c.torrents_edit_category(name=cat_name, save_path=save_path)
                    log.info("Updated category %r save_path → %s", cat_name, save_path)
            else:
                c.torrents_create_category(name=cat_name, save_path=save_path)
                log.info("Created category %r → %s", cat_name, save_path)

    def configure_completion_hook(self, api_base: str = "http://localhost:5001") -> None:
        """Set qBittorrent to call our webhook when a torrent finishes."""
        c = self._get_client()
        cmd = (
            f'curl -s -X POST {api_base}/torrents/completed '
            f'-H "Content-Type: application/json" '
            f'-d \'{{"hash":"%I","name":"%N","category":"%L",'
            f'"save_path":"%D","content_path":"%F","size":"%Z"}}\''
        )
        c.app_set_preferences(prefs={
            "autorun_enabled": True,
            "autorun_program": cmd,
        })
        log.info("Configured qBittorrent completion hook → %s/torrents/completed", api_base)

    def bind_interface(self, interface: str) -> None:
        """Bind all qBittorrent traffic to a specific network interface."""
        c = self._get_client()
        c.app_set_preferences(prefs={
            "current_interface_name": interface,
            "current_interface_address": "",
        })
        log.info("Bound qBittorrent to interface %r", interface)

    def get_bound_interface(self) -> str | None:
        """Return the currently bound network interface, if any."""
        try:
            c = self._get_client()
            prefs = c.app_preferences()
            iface = prefs.get("current_interface_name", "")
            return iface if iface else None
        except Exception:
            return None

    def is_connected(self) -> bool:
        try:
            self._get_client()
            return True
        except Exception:
            return False
