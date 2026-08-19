from logging.config import fileConfig
import os

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from okaasan.server.paths import STATIC_FOLDER

db_path = os.path.join(STATIC_FOLDER, "recipes.db")
db_url = os.getenv("RECIPES_DATABASE_URI", f"sqlite:///{db_path}")

config.set_main_option("sqlalchemy.url", db_url)

# Import ALL model modules that live on RecipesBase so autogenerate sees
# every table.
from okaasan.server.recipe.models import RecipesBase  # noqa: F401
from okaasan.server.models.user import User  # noqa: F401

target_metadata = RecipesBase.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
