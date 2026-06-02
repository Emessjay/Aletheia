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


@pytest.fixture(scope="session", autouse=True)
def _wipe_user_data_for_test_users():
    """Clear the auth-backend user-data tables for the deterministic test
    user IDs (Alice and Bob) at session start.

    The auth integration tests assume each session starts from an empty KV
    store / library list / etc., but the tables persist across runs against
    the local docker Postgres. We scope the wipe to the two test UUIDs so we
    don't disturb any real data sitting in a developer's database.

    Uses psycopg2 (sync) to avoid binding a stray asyncpg pool to a loop
    that won't match the per-test loops pytest-asyncio creates.
    """
    if not os.environ.get("DATABASE_URL"):
        yield
        return

    try:
        import psycopg2
    except ImportError:
        yield
        return

    from .auth_helpers import ALICE_ID, BOB_ID

    test_ids = (ALICE_ID, BOB_ID)
    try:
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
    except psycopg2.OperationalError:
        yield
        return
    try:
        with conn:
            with conn.cursor() as cur:
                for table in ("library", "bookmark", "highlight", "note", "kv", "bug_report"):
                    cur.execute(
                        "SELECT to_regclass(%s) IS NOT NULL", (f"public.{table}",)
                    )
                    (exists,) = cur.fetchone()
                    if exists:
                        cur.execute(
                            f"DELETE FROM {table} WHERE user_id::text = ANY(%s)",
                            (list(test_ids),),
                        )
    finally:
        conn.close()
    yield
