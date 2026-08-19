from ..feature import Feature


class RecipesFeature(Feature):
    name = "recipes"
    db_filename = "recipes.db"
    session_attr = "RecipesSessionLocal"

    def base(self):
        from .models import RecipesBase
        return RecipesBase

    def route_modules(self):
        from . import routes, route_ingredient, route_units
        return [routes, route_ingredient, route_units]

    def routers(self):
        from . import router, ingredient_router, units_router
        from ..recipe_sources import router as recipe_sources_router
        return [router, ingredient_router, units_router, recipe_sources_router]

    def setup(self, app, engine, session_local):
        from ..recipe_sources import configure as configure_recipe_sources
        configure_recipe_sources(session_local)
