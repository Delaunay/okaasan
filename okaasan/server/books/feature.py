from ..feature import Feature


class BooksFeature(Feature):
    """Books have no dedicated database — they stay on the shared main
    database.db, so this feature only owns routes and its library scanner.
    """

    name = "books"

    def routers(self):
        from . import router
        return [router]

    def setup(self, app, engine, session_local):
        from .library import BookLibraryScanner
        from . import routes as books_routes

        main_engine = app.state.SessionLocal().get_bind()
        scanner = BookLibraryScanner(app.state.static_folder, app.state.private_engine, main_engine)
        books_routes._library_scanner = scanner
        scanner.start()
