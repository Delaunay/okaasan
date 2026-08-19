from ..feature import Feature


class CalendarFeature(Feature):
    """Events and tasks share one database (CalendarBase), plus the Google
    Calendar sync route module which needs the same session factory.
    """

    name = "calendar"
    db_filename = "calendar.db"
    session_attr = "CalendarSessionLocal"

    def base(self):
        from .models import CalendarBase
        return CalendarBase

    def route_modules(self):
        from . import routes
        from ..tasks import routes as tasks_routes
        from ..integrations import route_gcalendar
        return [routes, tasks_routes, route_gcalendar]

    def routers(self):
        from . import router
        from ..tasks import router as tasks_router
        return [router, tasks_router]
