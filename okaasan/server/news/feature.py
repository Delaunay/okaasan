from ..feature import Feature


class NewsFeature(Feature):
    name = "news"
    db_filename = "news.db"
    session_attr = "NewsSessionLocal"

    def base(self):
        from .models import NewsBase
        return NewsBase

    def route_modules(self):
        from . import routes
        return [routes]

    def routers(self):
        from . import router
        return [router]

    def setup(self, app, engine, session_local):
        from .routes import start_refresher
        start_refresher(session_local)
