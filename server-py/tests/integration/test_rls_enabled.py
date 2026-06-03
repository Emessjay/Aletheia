"""Row Level Security is on for every table — the deny-all REST posture.

Supabase exposes every ``public``-schema table over its auto-generated
REST API to anyone holding the browser-shipped anon key. Migration 0006
flips RLS on everywhere with zero policies (deny-all): FastAPI is the only
data path, and it connects as the table owner, which RLS never constrains.

These tests pin both halves of that posture so a future migration that
``CREATE TABLE``s without enabling RLS — or that adds a policy nobody
meant to add — fails CI instead of silently reopening the side door.
"""
import asyncio
import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; integration tests require a running Postgres",
)


def _fetch(db_pool, query: str):
    async def _run():
        async with db_pool.acquire() as conn:
            return await conn.fetch(query)

    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(_run())
    finally:
        loop.close()


def test_every_public_table_has_rls_enabled(db_pool):
    """No ordinary table in public may have relrowsecurity = false."""
    rows = _fetch(
        db_pool,
        """
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND NOT c.relrowsecurity
        ORDER BY c.relname
        """,
    )
    unprotected = [r["relname"] for r in rows]
    assert unprotected == [], (
        f"Tables without RLS (REST-exposed on Supabase): {unprotected}. "
        "If a new migration created these, add ENABLE ROW LEVEL SECURITY "
        "to it — see alembic/versions/0006_enable_rls.py for why."
    )


def test_no_row_level_policies_exist(db_pool):
    """The posture is deny-all: RLS on, zero policies.

    A policy would grant PostgREST roles row access we don't intend —
    FastAPI is the only sanctioned data path. If a policy ever becomes
    genuinely necessary, update this test alongside the design note in
    migration 0006 so the change is loud and reviewed.
    """
    rows = _fetch(
        db_pool,
        "SELECT schemaname, tablename, policyname FROM pg_policies",
    )
    policies = [(r["tablename"], r["policyname"]) for r in rows]
    assert policies == [], f"Unexpected row-level policies: {policies}"
