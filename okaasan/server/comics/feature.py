from ..feature import Feature


class ComicsFeature(Feature):
    """Comics have no dedicated database — they stay on the shared main
    database.db, so this feature only owns routes and its library scanner.
    """

    name = "comics"

    def routers(self):
        from . import router
        return [router]

    def setup(self, app, engine, session_local):
        from .library import ComicLibraryScanner
        from . import routes as comics_routes

        main_engine = app.state.SessionLocal().get_bind()
        scanner = ComicLibraryScanner(app.state.static_folder, app.state.private_engine, main_engine)
        comics_routes._library_scanner = scanner
        scanner.start()
