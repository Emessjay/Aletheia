"""Postgres connection pool + per-request query helpers.

The phase-2 corpus moves out of bundled SQLite into Postgres. We use raw
asyncpg (no SQLAlchemy ORM): the routes accept verbatim SQL from the
frontend and `app.state.pool` is the single shared pool for the process.

FTS routing (option a, server-side rewrite). The frontend's SQL targets
SQLite FTS5 — `WHERE verse_fts MATCH $N`, `JOIN verse_fts`, `snippet(...)`,
`ORDER BY rank`. Rather than introduce a typed search endpoint and a
matching platform method (which would need parallel implementations on
Tauri + web), we rewrite the incoming SQL here: the rewriter recognizes
the two query shapes in use (the integration test's simple `WHERE
verse_fts MATCH $N` filter and the frontend's snippet+rank query) and
maps them to the Postgres `tsvector @@ websearch_to_tsquery` /
`ts_headline` / `ts_rank` equivalents. Section_fts is handled the same way.

This keeps the SQL boundary `{sql, params}` exactly as phase 1 defined it,
keeps the Tauri build untouched (it still talks to SQLite directly), and
isolates the FTS dialect translation to one well-tested file.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any

import asyncpg

MAX_ROWS = 50_000
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_SQL_BYTES = 16_000


class QueryError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


def resolve_database_url() -> str | None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        return None
    # asyncpg wants plain postgresql:// — strip any SQLAlchemy driver suffix.
    return re.sub(r"^postgresql\+asyncpg://", "postgresql://", url)


async def create_pool(database_url: str) -> asyncpg.Pool:
    """Open a modestly-sized pool. Fails fast on bad credentials/host.

    Sized and configured for Supabase's Supavisor pooler in **transaction
    mode** (port 6543). Session mode (port 5432) pins one server slot per
    client connection and the free tier caps those at 15 — two app
    containers overlapping during a rolling deploy (2×10) blew straight
    past it (EMAXCONNSESSION in production). Transaction mode multiplexes
    clients over the server pool instead, but it cannot support asyncpg's
    automatic prepared-statement cache (statements prepared on one server
    connection aren't visible on the next), so the cache must be off.
    Costs a re-parse per query against a direct/session connection too —
    acceptable, and it keeps one configuration valid for every DSN.

    min_size=0 so an idle container (the old one draining during a
    deploy) holds nothing.
    """
    return await asyncpg.create_pool(
        dsn=database_url,
        min_size=0,
        max_size=10,
        command_timeout=30,
        statement_cache_size=0,
    )


import asyncio


async def get_pool(app_state: Any) -> asyncpg.Pool:
    """Return the app's pool, opening it lazily on first use.

    Lifespan is the normal path (uvicorn calls it on startup). Tests that
    use ``httpx.ASGITransport`` directly skip lifespan, so we open here on
    demand. asyncpg pools are bound to the event loop they were created
    on; under pytest-asyncio's default function-scoped loop each test gets
    a fresh loop, so we re-open the pool whenever the loop changes.
    """
    loop = asyncio.get_running_loop()
    pool = getattr(app_state, "pool", None)
    pool_loop = getattr(app_state, "_pool_loop", None)
    if pool is not None and pool_loop is loop:
        return pool
    if pool is not None and pool_loop is not loop:
        # Stale pool from a previous test's loop — discard. Closing it on a
        # dead loop would error; just drop the reference.
        app_state.pool = None
    url = resolve_database_url()
    if not url:
        raise QueryError(
            "DATABASE_URL is not set; cannot serve corpus queries", 500,
        )
    app_state.pool = await create_pool(url)
    app_state._pool_loop = loop
    return app_state.pool


# ---------------------------------------------------------------------------
# FTS query rewriting

_VERSE_FTS_TABLE_RE = re.compile(r"\bverse_fts\b", re.IGNORECASE)
_SECTION_FTS_TABLE_RE = re.compile(r"\bsection_fts\b", re.IGNORECASE)
_VERSE_MATCH_RE = re.compile(
    r"\bverse_fts\s+MATCH\s+(\$\d+|\?)", re.IGNORECASE
)
_SECTION_MATCH_RE = re.compile(
    r"\bsection_fts\s+MATCH\s+(\$\d+|\?)", re.IGNORECASE
)
# FTS5 quoting (`"term"*`) doesn't translate to websearch_to_tsquery — strip the
# quotes/asterisks so the query becomes plain whitespace-separated terms that
# `websearch_to_tsquery` treats as ANDed prefix-ish stems.
_FTS5_QUOTED_TERM_RE = re.compile(r'"([^"]+)"\*?')


def _strip_fts5_quoting(query: str) -> str:
    if "*" not in query and '"' not in query:
        return query
    return _FTS5_QUOTED_TERM_RE.sub(lambda m: m.group(1), query)


def rewrite_fts(sql: str) -> str:
    """Translate SQLite FTS5 idioms in `sql` to Postgres equivalents.

    Recognized shapes (case-insensitive):

      - `WHERE verse_fts MATCH $N`  → `WHERE <table>.search_vector @@ websearch_to_tsquery('english', $N)`
        when the FROM clause references `verse` (with or without an alias).
      - `FROM verse_fts JOIN verse v ON v.id = verse_fts.rowid` → `FROM verse v`
        and any other reference to `verse_fts.<col>` is rewritten to use the
        joined verse alias.
      - `snippet(verse_fts, 0, $a, $b, '…', N)` → `ts_headline('english', v.text_plain, websearch_to_tsquery('english', $1), 'StartSel=…, StopSel=…, MaxFragments=1, MaxWords=N, MinWords=…')`
      - `ORDER BY rank` → `ORDER BY ts_rank(v.search_vector, websearch_to_tsquery('english', $1))`

    The FTS query parameter (`$1` by convention from the frontend) is left
    in place; the rewriter just changes the *shape* of the SQL.
    """
    if not (_VERSE_FTS_TABLE_RE.search(sql) or _SECTION_FTS_TABLE_RE.search(sql)):
        return sql

    out = sql
    # Identify which table this is (verse vs section). Frontend code only
    # searches verses today; section_fts is included for parity with the
    # schema's FTS5 declaration but doesn't appear in the frontend.
    if _VERSE_FTS_TABLE_RE.search(out):
        out = _rewrite_for(out, table="verse", text_col="text_plain")
    if _SECTION_FTS_TABLE_RE.search(out):
        out = _rewrite_for(out, table="section", text_col="body")
    return out


def _rewrite_for(sql: str, *, table: str, text_col: str) -> str:
    fts = f"{table}_fts"
    fts_re = re.compile(rf"\b{fts}\b", re.IGNORECASE)
    out = sql

    # 1) FROM verse_fts JOIN verse v ON v.id = verse_fts.rowid  →  FROM verse v
    join_pattern = re.compile(
        rf"\bFROM\s+{fts}\s+JOIN\s+{table}\s+(\w+)\s+ON\s+\w+\.id\s*=\s*{fts}\.rowid",
        re.IGNORECASE,
    )
    alias_holder: dict[str, str] = {}

    def _join_sub(m: re.Match[str]) -> str:
        alias = m.group(1)
        alias_holder["alias"] = alias
        return f"FROM {table} {alias}"

    out = join_pattern.sub(_join_sub, out)

    # If the alias wasn't established by the JOIN rewrite, try to find an
    # existing alias for the target table in the FROM clause.
    if "alias" not in alias_holder:
        alias_match = re.search(
            rf"\bFROM\s+{table}\s+(\w+)\b", out, re.IGNORECASE,
        )
        if alias_match and alias_match.group(1).lower() not in {
            "where", "join", "on", "order", "group", "limit", "natural",
        }:
            alias_holder["alias"] = alias_match.group(1)

    alias = alias_holder.get("alias", table)

    # 2) snippet(verse_fts, 0, $start, $end, '…', N) → ts_headline(...)
    #    Use the same $start/$end params for StartSel/StopSel so the
    #    frontend's existing mark-string params keep working as the
    #    snippet delimiters. We swap in literal sentinel strings here
    #    because ts_headline options are a literal string, not a SQL
    #    expression — the frontend params for marks are dropped in the
    #    rewritten query but the unused params are harmless.
    def _snippet_sub(m: re.Match[str]) -> str:
        max_words = m.group(1) or "12"
        query_param = "$1"  # FTS5 frontend always passes the search query as $1.
        return (
            f"ts_headline('english', {alias}.{text_col}, "
            f"websearch_to_tsquery('english', {query_param}), "
            f"'StartSel=​, StopSel=​, MaxFragments=1, MaxWords={max_words}, MinWords=3')"
        )

    snippet_re = re.compile(
        rf"\bsnippet\s*\(\s*{fts}\s*,[^)]*?,\s*'[^']*'\s*,\s*(\d+)\s*\)",
        re.IGNORECASE,
    )
    out = snippet_re.sub(_snippet_sub, out)

    # 3) WHERE/AND verse_fts MATCH $N → ... alias.search_vector @@ websearch_to_tsquery('english', $N)
    match_re = re.compile(
        rf"\b{fts}\s+MATCH\s+(\$\d+|\?)", re.IGNORECASE,
    )
    out = match_re.sub(
        lambda m: f"{alias}.search_vector @@ websearch_to_tsquery('english', {m.group(1)})",
        out,
    )

    # 4) ORDER BY rank → ORDER BY ts_rank(alias.search_vector, websearch_to_tsquery('english', $1)) DESC
    rank_re = re.compile(r"\bORDER\s+BY\s+rank\b", re.IGNORECASE)
    out = rank_re.sub(
        f"ORDER BY ts_rank({alias}.search_vector, websearch_to_tsquery('english', $1)) DESC",
        out,
    )

    # 5) Any residual `verse_fts.col` → `alias.col`. Should be rare after the
    #    JOIN rewrite, but covers stray references like `verse_fts.rowid`.
    out = re.sub(rf"\b{fts}\.rowid\b", f"{alias}.id", out, flags=re.IGNORECASE)
    out = fts_re.sub(alias, out)
    return out


# ---------------------------------------------------------------------------
# Query helpers

def _validate_sql(sql: str) -> None:
    if not isinstance(sql, str) or not sql:
        raise QueryError("sql must be a non-empty string", 400)
    if len(sql.encode("utf-8")) > MAX_SQL_BYTES:
        raise QueryError(f"sql exceeds {MAX_SQL_BYTES}-byte limit", 413)
    # asyncpg refuses multi-statement queries, but reject early for a clean 400.
    if ";" in _strip_literals(sql):
        raise QueryError(
            "sql must not contain ';' (multi-statement queries are not allowed)",
            400,
        )


_STR_LITERAL_RE = re.compile(r"'(?:''|[^'])*'")
_DQ_LITERAL_RE = re.compile(r'"(?:""|[^"])*"')


def _strip_literals(sql: str) -> str:
    return _DQ_LITERAL_RE.sub('""', _STR_LITERAL_RE.sub("''", sql))


def _enforce_caps(rows: list[dict[str, Any]]) -> None:
    if len(rows) > MAX_ROWS:
        raise QueryError(f"result exceeds {MAX_ROWS}-row cap ({len(rows)} rows)", 413)
    body = json.dumps(rows, default=str)
    if len(body) > MAX_RESPONSE_BYTES:
        raise QueryError(
            f"result exceeds {MAX_RESPONSE_BYTES}-byte cap ({len(body)} bytes)", 413,
        )


def _row_to_dict(record: asyncpg.Record) -> dict[str, Any]:
    return dict(record)


async def select(pool: asyncpg.Pool, sql: str, params: list[Any]) -> list[dict[str, Any]]:
    _validate_sql(sql)
    rewritten = rewrite_fts(sql)
    try:
        async with pool.acquire() as conn:
            records = await conn.fetch(rewritten, *params)
    except (asyncpg.PostgresError, asyncpg.InterfaceError, ValueError, TypeError) as err:
        raise QueryError(str(err), 400) from err
    rows = [_row_to_dict(r) for r in records]
    _enforce_caps(rows)
    return rows


async def select_one(
    pool: asyncpg.Pool, sql: str, params: list[Any],
) -> dict[str, Any] | None:
    _validate_sql(sql)
    rewritten = rewrite_fts(sql)
    try:
        async with pool.acquire() as conn:
            record = await conn.fetchrow(rewritten, *params)
    except (asyncpg.PostgresError, asyncpg.InterfaceError, ValueError, TypeError) as err:
        raise QueryError(str(err), 400) from err
    return _row_to_dict(record) if record is not None else None
