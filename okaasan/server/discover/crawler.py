"""DHT crawler — background thread using BEP 51 sample_infohashes + BEP 9 metadata.

Two-stage pipeline:
  1. Discovery (instant)  — save infohash, enqueue for metadata resolution
  2. Metadata fetch (slow) — BEP 9 via get_peers + fetch_metadata, parallel peer attempts
"""

from __future__ import annotations

import atexit
import binascii
import logging
import os
import queue
import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from sqlalchemy.orm import sessionmaker

from ..paths import private_folder
from ..task_registry import registry
from .models import DHTTorrent

log = logging.getLogger(__name__)

TASK_ID = "dht_crawler"
_WS_DEBOUNCE_SECONDS = 2.0
_DHT_STATE_DIR = "dht_state"

_RESOLVE_WORKERS = 10
_RESOLVE_QUEUE_MAX = 500
_PEER_TIMEOUT = 5.0
_MAX_PEER_ATTEMPTS = 4


class DHTCrawlerService:
    """Manages a background DHT crawling thread.

    Discovery (fast path) and metadata resolution (slow path) are decoupled:
    - Callbacks save infohashes to DB immediately and enqueue them for resolution
    - A thread pool processes the resolution queue concurrently
    """

    def __init__(self, engine):
        self._engine = engine
        self._Session = sessionmaker(bind=engine)
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._dht = None
        self._lock = threading.Lock()
        self._stats = {
            "discovered": 0,
            "metadata_resolved": 0,
            "resolve_pending": 0,
            "running": False,
        }
        self._ws_timer: threading.Timer | None = None
        self._recent_hashes: list[dict] = []
        self._state_dir = os.path.join(str(private_folder()), _DHT_STATE_DIR)
        os.makedirs(self._state_dir, exist_ok=True)
        self._resolve_queue: queue.Queue[str] = queue.Queue(maxsize=_RESOLVE_QUEUE_MAX)
        self._resolve_pool: ThreadPoolExecutor | None = None

    @property
    def running(self) -> bool:
        return self._stats["running"]

    def status(self) -> dict:
        with self._lock:
            return dict(self._stats)

    def start(self):
        if self._thread and self._thread.is_alive():
            return

        self._stop_event.clear()
        self._stats["running"] = True
        registry.register(TASK_ID, "DHT Crawler", status="running")
        self._schedule_ws_broadcast()

        self._resolve_pool = ThreadPoolExecutor(
            max_workers=_RESOLVE_WORKERS,
            thread_name_prefix="dht-resolve",
        )
        for _ in range(_RESOLVE_WORKERS):
            self._resolve_pool.submit(self._resolve_worker)

        self._thread = threading.Thread(
            target=self._run, daemon=True, name="dht-crawler"
        )
        self._thread.start()
        atexit.register(self._atexit_save)

    def stop(self):
        self._stop_event.set()
        if self._dht:
            try:
                self._dht.stop()
            except Exception:
                pass
        if self._thread:
            self._thread.join(timeout=10)
        if self._resolve_pool:
            self._resolve_pool.shutdown(wait=False)
            self._resolve_pool = None
        self._stats["running"] = False
        self._stats["resolve_pending"] = 0
        registry.update(TASK_ID, status="stopped")
        self._do_ws_broadcast()

    # ── State persistence ─────────────────────────────────────────

    @property
    def _node_id_path(self) -> str:
        return os.path.join(self._state_dir, "node_id.bin")

    @property
    def _routing_table_path(self) -> str:
        return os.path.join(self._state_dir, "routing_table.bin")

    def _load_node_id(self) -> bytes | None:
        try:
            with open(self._node_id_path, "rb") as f:
                nid = f.read(20)
                if len(nid) == 20:
                    log.info("Loaded persisted node ID: %s", nid.hex())
                    return nid
        except FileNotFoundError:
            pass
        return None

    def _save_node_id(self, nid: bytes):
        try: 
            with open(self._node_id_path, "wb") as f:
                f.write(nid)
        except Exception:
            log.debug("Failed to save node ID", exc_info=True)

    def _save_routing_table(self):
        if not self._dht:
            return
        try: 
            self._dht.save(self._routing_table_path)
            nodes, goods, _ = self._dht.root.stats()
            log.info("Saved routing table (%d nodes, %d good) to %s", nodes, goods, self._routing_table_path)
        except Exception:
            log.debug("Failed to save routing table", exc_info=True)

    def _load_routing_table(self):
        if not self._dht or not os.path.exists(self._routing_table_path):
            return 0
        try:
            self._dht.load(self._routing_table_path)
            nodes, goods, _ = self._dht.root.stats()
            if goods == 0 and nodes > 0:
                log.warning(
                    "Routing table has %d stale nodes and 0 good — discarding to bootstrap clean",
                    nodes,
                )
                os.remove(self._routing_table_path)
                return 0
            log.info("Loaded routing table (%d nodes, %d good) from %s", nodes, goods, self._routing_table_path)
            return goods
        except Exception:
            log.debug("Failed to load routing table", exc_info=True)
            return 0

    def _atexit_save(self):
        """Best-effort routing table save on process exit (uvicorn reload)."""
        if self._dht:
            self._save_routing_table()

    # ── DHT crawling thread ───────────────────────────────────────

    def _run(self):
        import btpydht
        from btpydht.dht import Node

        collected_hashes: set[str] = set()
        service = self

        class CrawlerDHT(btpydht.DHT):
            def on_get_peers_query(self, query):
                try:
                    ih_bytes = query[b"info_hash"]
                    if isinstance(ih_bytes, bytes) and len(ih_bytes) == 20:
                        ih = ih_bytes.hex()
                        if ih not in collected_hashes:
                            collected_hashes.add(ih)
                            service._on_new_infohash(ih)
                except Exception:
                    pass

            def on_announce_peer_query(self, query):
                try:
                    ih_bytes = query[b"info_hash"]
                    if isinstance(ih_bytes, bytes) and len(ih_bytes) == 20:
                        ih = ih_bytes.hex()
                        if ih not in collected_hashes:
                            collected_hashes.add(ih)
                            service._on_new_infohash(ih)
                except Exception:
                    pass

            def on_sample_infohashes_response(self, query, response):
                try:
                    samples = response.get(b"samples", b"")
                    for i in range(0, len(samples), 20):
                        chunk = samples[i:i + 20]
                        if len(chunk) == 20:
                            ih = chunk.hex()
                            if ih not in collected_hashes:
                                collected_hashes.add(ih)
                                service._on_new_infohash(ih)
                except Exception:
                    pass

        bind_port = int(os.environ.get("DHT_PORT", "6881"))

        try:
            node_id = self._load_node_id()
            self._dht = CrawlerDHT(bind_port=bind_port, id=node_id)

            self._save_node_id(self._dht.myid.value)

            self._dht.register_message(b"get_peers")
            self._dht.register_message(b"announce_peer")
            self._dht.register_message(b"sample_infohashes")

            self._dht.start()

            loaded_goods = self._load_routing_table()
            if loaded_goods > 0:
                log.info("DHT crawler started on port %d with %d cached nodes", bind_port, loaded_goods)
                registry.update(TASK_ID, status="running", detail=f"Resumed with {loaded_goods} cached nodes. Crawling...")
            else:
                log.info("DHT crawler started on port %d, bootstrapping from scratch...", bind_port)
                registry.update(TASK_ID, status="running", detail="Bootstrapping DHT...")

            for _ in range(30):
                if self._stop_event.is_set():
                    return
                time.sleep(1)
                nodes, goods, bads = self._dht.root.stats()
                if goods >= 8:
                    break

            nodes_total, goods, bads = self._dht.root.stats()
            log.info(
                "DHT bootstrap done — %d nodes (%d good, %d bad)",
                nodes_total, goods, bads,
            )
            registry.update(
                TASK_ID,
                detail=f"Bootstrapped: {goods} good nodes. Crawling...",
            )

            save_counter = 0
            while not self._stop_event.is_set():
                self._send_sample_queries(self._dht, Node)

                save_counter += 1
                if save_counter % 30 == 0:
                    self._save_routing_table()

                with self._lock:
                    stats = dict(self._stats)
                registry.update(
                    TASK_ID,
                    detail=f"Discovered {stats['discovered']}, "
                           f"resolved {stats['metadata_resolved']}, "
                           f"pending {stats['resolve_pending']}",
                )
                self._stop_event.wait(10)

        except Exception: 
            log.exception("DHT crawler error")
            registry.update(TASK_ID, status="error", error="Crawler crashed")
        finally:
            if self._dht:
                self._save_routing_table()
                try:
                    self._dht.stop()
                except Exception:
                    pass
            self._stats["running"] = False
            registry.update(TASK_ID, status="stopped")

    def _send_sample_queries(self, dht, NodeClass):
        """Send sample_infohashes to random nodes in the routing table."""
        try:
            target = os.urandom(20)
            nodes = dht.get_closest_nodes(target)
            if not nodes:
                return

            picked = nodes[:8] if len(nodes) <= 8 else random.sample(nodes, 8)
            for node in picked:
                try:
                    node.sample_infohashes(dht, target)
                except Exception:
                    pass
        except Exception:
            log.debug("Error sending sample_infohashes", exc_info=True)

    # ── WebSocket broadcasting ────────────────────────────────────

    def _schedule_ws_broadcast(self):
        """Debounced WebSocket push so we don't flood clients on bursts."""
        if self._ws_timer is not None:
            self._ws_timer.cancel()
        self._ws_timer = threading.Timer(
            _WS_DEBOUNCE_SECONDS, self._do_ws_broadcast,
        )
        self._ws_timer.daemon = True
        self._ws_timer.start()

    def _do_ws_broadcast(self):
        from ..notifications import hub
        with self._lock:
            payload = {
                "type": "dht_crawler_status",
                **self._stats,
                "recent": list(self._recent_hashes),
            }
        hub.publish(payload)

    # ── Discovery (fast path) ─────────────────────────────────────

    def _on_new_infohash(self, infohash: str):
        with self._lock:
            self._stats["discovered"] += 1

        db = self._Session()
        try:
            existing = (
                db.query(DHTTorrent)
                .filter(DHTTorrent.infohash == infohash)
                .first()
            )
            if existing:
                existing.hits = (existing.hits or 1) + 1
                db.commit()
                with self._lock:
                    for entry in self._recent_hashes:
                        if entry["infohash"] == infohash:
                            entry["hits"] = existing.hits
                            break
                self._schedule_ws_broadcast()
                return

            peer_count = None
            if False and self._dht:
                peer_count = 0
                try:
                    ih_bytes = binascii.a2b_hex(infohash)
                    peers = self._dht.get_peers(ih_bytes, block=False)
                    if peers:
                        peer_count = len(peers)
                except Exception:
                    pass

            torrent = DHTTorrent(
                infohash=infohash,
                hits=1,
                peers_count=peer_count,
                discovered_at=datetime.now(timezone.utc),
            )
            db.add(torrent)
            db.commit()

            with self._lock:
                self._recent_hashes.append(torrent.to_json())
                if len(self._recent_hashes) > 50:
                    self._recent_hashes = self._recent_hashes[-50:]

            try:
                self._resolve_queue.put_nowait(infohash)
                with self._lock:
                    self._stats["resolve_pending"] = self._resolve_queue.qsize()
            except queue.Full:
                pass

            self._schedule_ws_broadcast()
        except Exception:
            db.rollback()
            log.debug("Failed to store infohash %s", infohash, exc_info=True)
        finally:
            db.close()

    # ── Resolution (slow path — worker pool) ──────────────────────

    def _resolve_worker(self):
        """Worker thread: waits for the queue signal, then picks the best unresolved torrent from DB."""
        while not self._stop_event.is_set():
            try:
                self._resolve_queue.get(timeout=2)
            except queue.Empty:
                continue

            db = self._Session()
            try:
                torrent = (
                    db.query(DHTTorrent)
                    .filter(
                        DHTTorrent.metadata_resolved == False,
                        DHTTorrent.resolve_attempts < 10,
                    )
                    .order_by(
                        DHTTorrent.resolve_attempts.asc().nullsfirst(),
                        DHTTorrent.peers_count.desc().nullsfirst(),
                        DHTTorrent.hits.desc().nullsfirst(),
                    )
                    .first()
                )
                if torrent:
                    torrent.resolve_attempts = (torrent.resolve_attempts or 0) + 1
                    db.commit()
                    with self._lock:
                        self._stats["resolve_pending"] = self._resolve_queue.qsize()
                    self._try_resolve_metadata(db, torrent)

                expired = (
                    db.query(DHTTorrent)
                    .filter(
                        DHTTorrent.metadata_resolved == False,
                        DHTTorrent.resolve_attempts >= 10,
                    )
                    .delete()
                )
                if expired:
                    db.commit()
                    log.info("Deleted %d torrents exceeding 10 resolve attempts", expired)
            except Exception:
                db.rollback()
                log.debug("Resolve worker error", exc_info=True)
            finally:
                db.close()

    def _try_resolve_metadata(self, db, torrent: DHTTorrent):
        """BEP 9 metadata fetch — tries multiple peers in parallel, first success wins."""
        if not self._dht:
            return

        try:
            ih_bytes = binascii.a2b_hex(torrent.infohash)

            with ThreadPoolExecutor(max_workers=1) as tp:
                future = tp.submit(self._dht.get_peers, ih_bytes, block=True, limit=10)
                try:
                    peers = future.result(timeout=30)
                except Exception:
                    peers = None

            if not peers:
                return 

            torrent.peers_count = len(peers)

            from btpydht.metadata import fetch_metadata

            meta = None
            attempt_peers = peers[:_MAX_PEER_ATTEMPTS]
            with ThreadPoolExecutor(max_workers=len(attempt_peers)) as pool:
                futures = {
                    pool.submit(fetch_metadata, ih_bytes, ip, port, _PEER_TIMEOUT): (ip, port)
                    for ip, port in attempt_peers
                }
                for future in as_completed(futures):
                    try:
                        result = future.result()
                    except Exception:
                        continue
                    if result and b"name" in result:
                        meta = result
                        for f in futures:
                            f.cancel()
                        break

            if meta and b"name" in meta:
                torrent.raw_metadata = _meta_to_json(meta)
                torrent.name = meta[b"name"].decode("utf-8", errors="replace")
                if b"length" in meta:
                    torrent.size = meta[b"length"]
                    torrent.files_json = [{
                        "path": torrent.name,
                        "size": meta[b"length"],
                    }]
                    torrent.files_count = 1
                elif b"files" in meta:
                    files = []
                    total_size = 0
                    for f in meta[b"files"]:
                        fsize = f.get(b"length", 0)
                        total_size += fsize
                        path_parts = f.get(b"path", [])
                        path = "/".join(
                            p.decode("utf-8", errors="replace")
                            if isinstance(p, bytes) else str(p)
                            for p in path_parts
                        )
                        files.append({"path": path, "size": fsize})
                    torrent.size = total_size
                    torrent.files_count = len(files)
                    torrent.files_json = files
                torrent.metadata_resolved = True
                db.commit()
                with self._lock:
                    self._stats["metadata_resolved"] += 1
                    for entry in self._recent_hashes:
                        if entry["infohash"] == torrent.infohash:
                            entry.update(torrent.to_json())
                            break
                self._schedule_ws_broadcast() 
            else:
                db.commit()
        except Exception:
            log.debug("Metadata resolve failed for %s", torrent.infohash, exc_info=True)


def _meta_to_json(meta: dict) -> dict:
    """Convert a BEP 9 info dict (bytes keys/values) to a JSON-serializable dict.

    Skips ``pieces`` (binary SHA1 blob, not useful to store verbatim).
    """
    def _convert(obj):
        if isinstance(obj, dict):
            out = {}
            for k, v in obj.items():
                key = k.decode("utf-8", errors="replace") if isinstance(k, bytes) else str(k)
                if key == "pieces":
                    out[key] = f"<{len(v)} bytes>" if isinstance(v, bytes) else str(v)
                    continue
                out[key] = _convert(v)
            return out
        if isinstance(obj, list):
            return [_convert(item) for item in obj]
        if isinstance(obj, bytes):
            try:
                return obj.decode("utf-8")
            except UnicodeDecodeError:
                return obj.hex()
        if isinstance(obj, (int, float, bool)) or obj is None:
            return obj
        return str(obj)

    return _convert(meta)


_crawler: DHTCrawlerService | None = None


def get_crawler() -> DHTCrawlerService | None:
    return _crawler


def init_crawler(engine) -> DHTCrawlerService:
    global _crawler
    _crawler = DHTCrawlerService(engine)
    return _crawler
