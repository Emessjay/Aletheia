"""Integration-test fixtures (per the seeded test contract).

Session bring-up (migrations + ingest) lives in ``tests/conftest.py`` so it
covers both acceptance and integration runs.
"""

from __future__ import annotations

import asyncio
import os

import pytest


@pytest.fixture(scope="session")
def db_pool():
    """Shared asyncpg pool for tests that want to query Postgres directly."""
    import asyncpg

    if not os.environ.get("DATABASE_URL"):
        pytest.skip("DATABASE_URL not set")
    loop = asyncio.new_event_loop()
    pool = loop.run_until_complete(
        asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=1, max_size=4)
    )
    try:
        yield pool
    finally:
        loop.run_until_complete(pool.close())
        loop.close()


@pytest.fixture()
def clean_db(db_pool):
    """Truncate corpus tables so a test starts from a known empty state."""
    async def _truncate():
        async with db_pool.acquire() as conn:
            await conn.execute(
                "TRUNCATE TABLE book, chapter, verse, word, work, section, "
                "citation, strongs, xref, meta RESTART IDENTITY CASCADE"
            )
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
    loop.run_until_complete(_truncate())
    yield
