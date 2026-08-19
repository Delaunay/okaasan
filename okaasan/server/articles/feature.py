from ..feature import Feature


class ArticlesFeature(Feature):
    name = "articles"
    db_filename = "articles.db"
    session_attr = "ArticlesSessionLocal"

    def base(self):
        from .models import ArticlesBase
        return ArticlesBase

    def route_modules(self):
        from . import routes
        return [routes]

    def routers(self):
        from . import router
        return [router]
