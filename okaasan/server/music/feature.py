from ..feature import Feature


class AudioFeature(Feature):
    """Music, audiobooks, and podcasts share one database (AudioBase)."""

    name = "audio"
    db_filename = "audio.db"
    session_attr = "AudioSessionLocal"

    def base(self):
        from .models import AudioBase
        return AudioBase

    def route_modules(self):
        from . import routes as music_routes
        from ..audiobooks import routes as audiobooks_routes
        from ..podcasts import routes as podcasts_routes
        return [music_routes, audiobooks_routes, podcasts_routes]

    def routers(self):
        from . import router as music_router
        from ..audiobooks import router as audiobooks_router
        from ..podcasts import router as podcasts_router
        return [music_router, audiobooks_router, podcasts_router]

    def setup(self, app, engine, session_local):
        from .library import MusicLibraryScanner
        from . import routes as music_routes
        music_scanner = MusicLibraryScanner(app.state.static_folder, app.state.private_engine, engine)
        music_routes._music_scanner = music_scanner
        music_scanner.start()

        from ..audiobooks.library import AudiobookLibraryScanner
        from ..audiobooks import routes as audiobooks_routes
        ab_scanner = AudiobookLibraryScanner(app.state.static_folder, app.state.private_engine, engine)
        audiobooks_routes._library_scanner = ab_scanner
        ab_scanner.start()

        from ..podcasts.rss_fetcher import PodcastRefresher
        from ..podcasts import routes as podcasts_routes
        podcast_refresher = PodcastRefresher(session_local, interval_minutes=30)
        podcasts_routes._refresher = podcast_refresher
        podcast_refresher.start()
