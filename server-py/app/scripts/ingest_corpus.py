"""Bulk-load the SQLite corpus (``data/Aletheia.sqlite``) into Postgres.

Idempotent: each run truncates every corpus table and reloads, so two
consecutive invocations produce identical row counts. Uses asyncpg's
``copy_records_to_table`` (binary COPY) for every table — single-row inserts
would take ~10 minutes against the verse + word tables (~1.1M rows total).

The ``search_vector`` columns on ``verse`` and ``section`` are GENERATED
columns, so they populate automatically as the rows land — no separate
backfill pass needed.

Run from a worktree (env: ``DATABASE_URL`` + optional
``ALETHEIA_CORPUS_PATH``)::

    python -m app.scripts.ingest_corpus

Defaults the SQLite path to ``<repo>/data/Aletheia.sqlite``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Iterable

import asyncpg

from ..db import resolve_database_url

log = logging.getLogger("aletheia.ingest")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")


def _default_corpus_path() -> Path:
    env = os.environ.get("ALETHEIA_CORPUS_PATH")
    if env:
        return Path(env).resolve()
    # server-py/app/scripts/ingest_corpus.py → repo root is three levels up.
    return (Path(__file__).resolve().parents[3] / "data" / "Aletheia.sqlite").resolve()


# Column lists per table, in the same order we'll read from SQLite and write
# to Postgres. Excludes the generated ``search_vector`` column (Postgres
# computes it). For nullable/has-default integer PKs we still copy the source
# id so foreign keys keep pointing at the right rows.
TABLE_COLUMNS: dict[str, tuple[str, ...]] = {
    "book": ("id", "language", "canon", "slug", "name", "abbreviation", "testament", "order_index"),
    "chapter": ("id", "book_id", "number", "verse_count"),
    "verse": ("id", "chapter_id", "number", "text", "text_plain", "lead"),
    "word": ("id", "verse_id", "position", "surface", "lemma", "strongs", "morphology", "base_text", "english"),
    "strongs": ("id", "language", "lemma", "transliteration", "gloss", "definition", "kjv_usage", "lemma_lower"),
    "xref": ("id", "from_verse_id", "to_verse_start", "to_verse_end", "weight"),
    "work": ("id", "slug", "title", "author", "kind"),
    "section": ("id", "work_id", "parent_id", "ordinal_path", "kind", "label", "language", "body", "ordering"),
    "citation": ("id", "section_id", "book_slug", "chapter", "verse_start", "verse_end", "span_start", "span_end"),
    "meta": ("key", "value"),
}

# Tables are listed parent → child so the FK references resolve at load time
# (we TRUNCATE...CASCADE first anyway, but it keeps the COPY order predictable
# even with FK checks left on).
INGEST_ORDER: tuple[str, ...] = (
    "book", "chapter", "verse", "word",
    "work", "section", "citation",
    "strongs", "xref", "meta",
)


def _iter_rows(sqlite_conn: sqlite3.Connection, table: str, columns: tuple[str, ...]) -> Iterable[tuple]:
    """Stream rows from SQLite as tuples in the declared column order."""
    cur = sqlite_conn.execute(
        f'SELECT {", ".join(columns)} FROM {table}'
    )
    while True:
        batch = cur.fetchmany(10_000)
        if not batch:
            return
        yield from batch


async def _truncate_all(conn: asyncpg.Connection) -> None:
    # One TRUNCATE call so the CASCADE wave runs once. Includes RESTART
    # IDENTITY to reset any sequences (none of our PKs use serial today,
    # but defensive — Postgres ignores it for non-sequence PKs).
    tables = ", ".join(INGEST_ORDER)
    await conn.execute(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE")


async def _copy_table(
    conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
    table: str,
) -> int:
    cols = TABLE_COLUMNS[table]
    rows = list(_iter_rows(sqlite_conn, table, cols))
    if not rows:
        return 0
    await conn.copy_records_to_table(table, records=rows, columns=cols)
    return len(rows)


async def ingest(database_url: str, corpus_path: Path) -> None:
    if not corpus_path.exists():
        raise SystemExit(f"corpus not found: {corpus_path}")
    log.info("source: %s", corpus_path)
    log.info("target: %s", _redact(database_url))

    sqlite_conn = sqlite3.connect(f"file:{corpus_path}?mode=ro", uri=True)
    try:
        pg = await asyncpg.connect(database_url)
        try:
            t0 = time.monotonic()
            async with pg.transaction():
                await _truncate_all(pg)
                for table in INGEST_ORDER:
                    rt0 = time.monotonic()
                    n = await _copy_table(pg, sqlite_conn, table)
                    log.info(
                        "  %-9s %9d rows  (%.1fs)",
                        table, n, time.monotonic() - rt0,
                    )
            log.info("ingest complete in %.1fs", time.monotonic() - t0)
        finally:
            await pg.close()
    finally:
        sqlite_conn.close()


def _redact(url: str) -> str:
    import re

    return re.sub(r"://([^:/@]+):[^@]*@", r"://\1:****@", url)


def main(argv: list[str] | None = None) -> int:
    database_url = resolve_database_url()
    if not database_url:
        print("DATABASE_URL is not set", file=sys.stderr)
        return 2
    asyncio.run(ingest(database_url, _default_corpus_path()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
