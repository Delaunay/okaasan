"""CLI tool to sync recipes from an external website (HelloFresh, ...) into the DB."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from argklass.arguments import add_arguments
from argklass.command import Command, newparser

logger = logging.getLogger(__name__)


@dataclass
class Arguments:
    source: str = "hellofresh"
    limit: int = None
    list_sources: bool = False


class RecipeSync(Command):
    """Import recipes from an external recipe website into the local database."""

    name: str = "recipe-sync"

    @staticmethod
    def arguments(subparsers):
        parser = newparser(subparsers, RecipeSync)
        add_arguments(parser, Arguments)

    @staticmethod
    def execute(args):
        logging.basicConfig(level=logging.INFO)

        from okaasan.server.recipe_sources.registry import SOURCES

        if getattr(args, "list_sources", False):
            for name in sorted(SOURCES):
                print(name)
            return

        from sqlalchemy import create_engine, event
        from sqlalchemy.orm import sessionmaker

        from okaasan.server.models.common import Base
        from okaasan.server.paths import STATIC_FOLDER
        from okaasan.server.recipe_sources.sync import sync_source

        db_path = os.path.join(STATIC_FOLDER, "database.db")
        engine = create_engine(
            f"sqlite:///{db_path}",
            connect_args={"check_same_thread": False, "timeout": 30},
            pool_pre_ping=True,
        )

        def _set_sqlite_pragmas(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()

        event.listen(engine, "connect", _set_sqlite_pragmas)
        Base.metadata.create_all(bind=engine)
        SessionLocal = sessionmaker(bind=engine)

        source = args.source
        if source not in SOURCES:
            print(f"Unknown recipe source {source!r}. Available: {sorted(SOURCES)}")
            return 1

        def on_progress(stats):
            print(
                f"\rimported={stats['imported']} skipped={stats['skipped']} "
                f"failed={stats['failed']}",
                end="",
                flush=True,
            )

        print(f"Syncing recipes from {source!r}"
              + (f" (limit={args.limit})" if args.limit else " (no limit)"))
        stats = sync_source(source, SessionLocal, limit=args.limit, on_progress=on_progress)
        print()
        print(f"Done: {stats['imported']} imported, {stats['skipped']} skipped, "
              f"{stats['failed']} failed")
        if stats["errors"]:
            print("Errors:")
            for err in stats["errors"][:20]:
                print(f"  - {err}")
            if len(stats["errors"]) > 20:
                print(f"  ... and {len(stats['errors']) - 20} more")


COMMANDS = RecipeSync
