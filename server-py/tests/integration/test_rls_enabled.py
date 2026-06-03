"""Row Level Security is on for every table — the deny-all REST posture.

Supabase exposes every ``public``-schema table over its auto-generated
REST API to anyone holding the browser-shipped anon key. Migration 0006
flips RLS on everywhere with zero policies (deny-all): FastAPI is the only
data path, and it connects as the table owner, which RLS never constrains.

These tests pin both halves of that posture so a future migration that
``CREATE TABLE``s without enabling RLS — or that adds a policy nobody
meant to add — fails CI instead of silently reopening the side door.

Uses sync psycopg2 (like the user-data test modules) rather than the
asyncpg ``db_pool`` fixture — catalog reads don't need a pool, and
psycopg2 sidesteps event-loop lifecycle entirely.
"""
import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; integration tests require a running Postgres",
)


def _fetch_all(query: str):
    import psycopg2

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            cur.execute(query)
            return cur.fetchall()
    finally:
        conn.close()


def test_every_public_table_has_rls_enabled():
    """No ordinary table in public may have relrowsecurity = false."""
    rows = _fetch_all(
        """
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND NOT c.relrowsecurity
        ORDER BY c.relname
        """
    )
    unprotected = [r[0] for r in rows]
    assert unprotected == [], (
        f"Tables without RLS (REST-exposed on Supabase): {unprotected}. "
        "If a new migration created these, add ENABLE ROW LEVEL SECURITY "
        "to it — see alembic/versions/0006_enable_rls.py for why."
    )


def test_no_row_level_policies_exist():
    """The posture is deny-all: RLS on, zero policies.

    A policy would grant PostgREST roles row access we don't intend —
    FastAPI is the only sanctioned data path. If a policy ever becomes
    genuinely necessary, update this test alongside the design note in
    migration 0006 so the change is loud and reviewed.
    """
    rows = _fetch_all(
        "SELECT tablename, policyname FROM pg_policies"
    )
    assert rows == [], f"Unexpected row-level policies: {rows}"
