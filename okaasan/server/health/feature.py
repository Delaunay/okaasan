from ..feature import Feature


class HealthFeature(Feature):
    """Health has no routes of its own here — its router is created via the
    ``create_health_router(engine)`` factory in ``integrations/__init__.py``,
    which receives this feature's engine directly. This Feature only owns
    the database.
    """

    name = "health"
    db_filename = "health.db"
    private = True
    session_attr = "HealthSessionLocal"

    def base(self):
        from .models import HealthBase
        return HealthBase
