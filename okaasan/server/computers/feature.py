from ..feature import Feature


class ComputersFeature(Feature):
    """Computer management + background task runner, on its own DB
    (computer_tasks.db) to avoid bloating the main database."""

    name = "computers"
    db_filename = "computer_tasks.db"
    private = True
    session_attr = "TasksSessionLocal"

    def base(self):
        from .models import TaskBase
        return TaskBase

    def route_modules(self):
        from . import routes
        return [routes]

    def routers(self):
        from . import router
        return [router]

    def setup(self, app, engine, session_local):
        from .tasks import recover_orphaned_tasks
        recover_orphaned_tasks(session_local)
