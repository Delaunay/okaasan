"""Helpers for wiring up the app's per-domain SQLite databases.

Each feature area (recipes, news, audio, video, ...) gets its own SQLite
file with its own declarative base, to keep any single database small
enough for git and fast to back up. ``init_db`` collapses the
create-engine/set-pragmas/create-tables/make-sessionmaker boilerplate that
was otherwise repeated once per database in server.py.
"""
from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


def _set_sqlite_pragmas(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()


def init_db(
    app: Any,
    base: Any,
    db_path: str,
    *,
    session_attr: str | None = None,
    wire: Iterable[Any] = (),
):
    """Create an engine + sessionmaker for one domain's SQLite file.

    - Runs ``base.metadata.create_all`` on the new engine.
    - If ``session_attr`` is given, stores the sessionmaker at
      ``app.state.<session_attr>`` (for routes that take a ``Request``).
    - Sets ``._SessionLocal`` on every module in ``wire`` (for routes/
      background jobs that need a session factory without a ``Request``).

    Returns ``(engine, SessionLocal)``.
    """
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_pre_ping=True,
    )
    event.listen(engine, "connect", _set_sqlite_pragmas)
    base.metadata.create_all(bind=engine)

    session_local = sessionmaker(bind=engine)

    if session_attr:
        setattr(app.state, session_attr, session_local)
    for module in wire:
        module._SessionLocal = session_local

    return engine, session_local
