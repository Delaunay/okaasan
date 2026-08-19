from ..feature import Feature


class GamesFeature(Feature):
    """ROMs have no dedicated database — they stay on the shared main
    database.db, so this feature only owns routes and its library scanner.
    """

    name = "games"

    def routers(self):
        from . import router
        return [router]

    def setup(self, app, engine, session_local):
        from .library import GameLibraryScanner
        from . import routes as games_routes

        main_engine = app.state.SessionLocal().get_bind()
        scanner = GameLibraryScanner(app.state.static_folder, app.state.private_engine, main_engine)
        games_routes._library_scanner = scanner
        scanner.start()
