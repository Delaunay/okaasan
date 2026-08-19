import logging
import os
import threading
import time
from pathlib import Path

from ..feature import Feature

log = logging.getLogger("okaasan.shows")


class VideoFeature(Feature):
    name = "video"
    db_filename = "video.db"
    session_attr = "VideoSessionLocal"

    def base(self):
        from .models import VideoBase
        return VideoBase

    def route_modules(self):
        from . import routes
        return [routes]

    def routers(self):
        from . import router
        return [router]

    def setup(self, app, engine, session_local):
        static_folder = app.state.static_folder

        from . import routes as shows_routes
        from .library import LibraryScanner
        library_scanner = LibraryScanner(static_folder, app.state.private_engine, engine)
        shows_routes._library_scanner = library_scanner
        library_scanner.start()

        self._auto_import_trakt(static_folder, session_local)
        self._auto_import_kitsu(static_folder, session_local)
        self._start_poster_backfill(static_folder, session_local)

    def _auto_import_trakt(self, static_folder, session_local):
        """Auto-import Trakt data if shows tables are empty."""
        from .models import Media

        db = session_local()
        try:
            if db.query(Media).count() == 0:
                shows_dir = os.path.join(static_folder, "shows")
                if os.path.isdir(shows_dir):
                    from .importer import import_trakt_data
                    from .routes import _get_tmdb_client_for_import
                    tmdb_for_import = _get_tmdb_client_for_import(static_folder)
                    import_trakt_data(
                        db, Path(shows_dir), base_dir=Path(static_folder),
                        tmdb_client=tmdb_for_import,
                    )
        except Exception as e:
            log.warning("Auto-import of Trakt data failed: %s", e)
        finally:
            db.close()

    def _auto_import_kitsu(self, static_folder, session_local):
        """Auto-import Kitsu/MAL anime dump in the background (doesn't block startup)."""
        from ..paths import private_folder

        kitsu_dumps_dir = Path(static_folder) / "dumps" / "kitsu"
        kitsu_marker = private_folder() / "_kitsu_imported.marker"
        if not kitsu_dumps_dir.is_dir() or kitsu_marker.exists():
            return

        def _run():
            db = session_local()
            try:
                from .importer import import_kitsu_data
                import_kitsu_data(db, kitsu_dumps_dir)
                kitsu_marker.write_text("done")
            except Exception as e:
                log.warning("Auto-import of Kitsu data failed: %s", e)
            finally:
                db.close()

        threading.Thread(target=_run, name="kitsu-import", daemon=True).start()
        log.info("Kitsu import started in background thread")

    def _start_poster_backfill(self, static_folder, session_local):
        """Backfill missing show/movie posters from TMDB in the background."""

        def _run():
            time.sleep(30)  # let imports finish first
            db = session_local()
            try:
                from .models import Media
                from .routes import _get_tmdb_client_for_import
                from .posters import PosterStore

                tmdb = _get_tmdb_client_for_import(static_folder)
                if not tmdb.available:
                    return
                posters = PosterStore(Path(static_folder))

                missing = db.query(Media).filter(
                    Media.poster_path.is_(None),
                    Media.tmdb_id.isnot(None),
                ).all()

                if not missing:
                    return

                fetched = 0
                for media in missing:
                    try:
                        if media.media_type == "show":
                            info = tmdb.get_show(media.tmdb_id)
                        else:
                            info = tmdb.get_movie(media.tmdb_id)
                        if info and info.get("poster_path"):
                            path = posters.save_from_tmdb(
                                media.media_type, media.tmdb_id, info["poster_path"], media.trakt_id
                            )
                            if path:
                                media.poster_path = path
                                fetched += 1
                    except Exception:
                        continue

                db.commit()
                log.info("Poster backfill complete: %d/%d fetched", fetched, len(missing))
            except Exception as e:
                log.warning("Poster backfill failed: %s", e)
            finally:
                db.close()

        threading.Thread(target=_run, name="poster-backfill", daemon=True).start()
