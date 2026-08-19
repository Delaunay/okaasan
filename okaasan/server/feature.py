"""Self-registering Feature base class.

Each self-contained server feature (news, recipes, audio, video, health,
calendar, articles, ...) defines one ``Feature`` subclass describing its
own database, routes, and background jobs, co-located with its module.
``server.py`` just calls ``register_feature(app, SomeFeature())`` instead
of hand-wiring engine/session/router/scanner boilerplate per module.
"""
from __future__ import annotations

import os
from typing import Any, Iterable

from .db_utils import init_db


class Feature:
    """A self-contained server feature.

    Subclasses override only the pieces they need — a feature with no
    dedicated database just leaves ``base()`` returning ``None``.
    """

    name: str = ""
    db_filename: str | None = None   # e.g. "recipes.db"; None = no dedicated DB
    private: bool = False            # STATIC_FOLDER (False) vs private_folder() (True)
    session_attr: str | None = None  # app.state.<session_attr>; defaults to f"{Name}SessionLocal"

    def base(self):
        """Declarative base for this feature's DB, or None if it has none."""
        return None

    def route_modules(self) -> Iterable[Any]:
        """Modules whose module-level ``_SessionLocal`` should be set to
        this feature's session factory (for routes/background jobs that
        don't have a ``Request`` to pull it from ``app.state``)."""
        return ()

    def routers(self) -> Iterable[Any]:
        """APIRouters to mount on the app."""
        return ()

    def setup(self, app, engine, session_local) -> None:
        """Called once this feature's DB (if any) and routes are wired.
        Register anything else it owns: background scanners, refreshers,
        one-off startup imports."""


def register_feature(app, feature: Feature):
    """Wire up one Feature: create its DB (if any), mount its routers, and
    run its own setup(). Returns (engine, session_local) — both None if the
    feature has no dedicated DB.
    """
    from .paths import STATIC_FOLDER, private_folder

    engine = session_local = None
    base = feature.base()
    if base is not None:
        root = str(private_folder()) if feature.private else STATIC_FOLDER
        db_path = os.path.join(root, feature.db_filename)
        session_attr = feature.session_attr or f"{feature.name.capitalize()}SessionLocal"
        engine, session_local = init_db(
            app, base, db_path,
            session_attr=session_attr,
            wire=feature.route_modules(),
        )

    for router in feature.routers():
        app.include_router(router)

    feature.setup(app, engine, session_local)

    return engine, session_local
