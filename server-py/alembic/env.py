"""Alembic env — uses DATABASE_URL and runs migrations synchronously via psycopg-style URL.

We translate asyncpg URLs (postgresql+asyncpg://) back to a plain postgresql://
URL for Alembic, since migrations don't need async execution.
"""
from __future__ import annotations

import os
import re

from alembic import context
from sqlalchemy import engine_from_config, pool

config = context.config

target_metadata = None


def _resolve_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. "
            "Example: postgresql://aletheia:aletheia@localhost:5432/aletheia"
        )
    # Strip the asyncpg driver suffix if present — alembic uses sync sqlalchemy.
    return re.sub(r"^postgresql\+asyncpg://", "postgresql://", url)


def run_migrations_offline() -> None:
    context.configure(
        url=_resolve_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section) or {}
    cfg["sqlalchemy.url"] = _resolve_url()
    connectable = engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
