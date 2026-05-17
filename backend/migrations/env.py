"""Alembic environment — reads DATABASE_URL from env, uses SQLAlchemy metadata."""

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from dotenv import load_dotenv

# Make backend root importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from models_db import Base  # noqa: E402

config = context.config

# Override URL from env, converting to sync driver for migrations (alembic uses sync)
db_url = os.getenv("DATABASE_URL", "sqlite:///./energy.db")
# Force the sync driver — alembic does not use the async pool here
if db_url.startswith("postgresql+asyncpg"):
    sync_url = db_url.replace("postgresql+asyncpg", "postgresql+psycopg")
elif db_url.startswith("sqlite+aiosqlite"):
    sync_url = db_url.replace("sqlite+aiosqlite", "sqlite")
else:
    sync_url = db_url
# alembic feeds the URL through configparser, which treats `%` as interpolation
# syntax. URL-encoded passwords (e.g. `%40` for `@`) blow up unless we double
# the percent signs so configparser collapses them back to a single `%`.
config.set_main_option("sqlalchemy.url", sync_url.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from sqlalchemy import engine_from_config

    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        do_run_migrations(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
