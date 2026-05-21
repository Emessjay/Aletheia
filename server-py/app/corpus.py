"""Read-only sqlite3 wrapper for the bundled corpus.

Mirrors server/src/corpus.ts. We use stdlib `sqlite3` (not aiosqlite) because:
  1. the corpus is read-only and queries are bounded by row/byte caps,
  2. FastAPI runs sync handlers on the threadpool so a `check_same_thread=False`
     connection plus a threading lock is the simplest correct primitive,
  3. avoids pulling another dependency for what is effectively local file I/O.

SQL is accepted verbatim from the frontend. That is safe here because:
  1. the handle is opened readonly via the `mode=ro` URI flag; a runaway
     UPDATE/DELETE throws before touching disk,
  2. only public-domain biblical text lives in the DB,
  3. row/byte caps below prevent a `SELECT *` from OOM'ing the Railway dyno.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from pathlib import Path
from typing import Any

MAX_ROWS = 50_000
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
MAX_SQL_BYTES = 16_000


class QueryError(Exception):
    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.status = status


class CorpusHandle:
    def __init__(self, path: Path) -> None:
        self.path = path
        uri = f"file:{path}?mode=ro"
        # check_same_thread=False so the connection can be shared across
        # FastAPI's threadpool workers; a single lock serializes access.
        self._conn = sqlite3.connect(uri, uri=True, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()

    def select(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
        params = params or []
        _reject_multi_statement(sql)
        bound = _bind_args(sql, params)
        with self._lock:
            try:
                cur = self._conn.execute(sql, bound)
                rows = [dict(r) for r in cur.fetchall()]
            except sqlite3.Error as err:
                raise QueryError(str(err), 400) from err
        _enforce_caps(rows)
        return rows

    def select_one(self, sql: str, params: list[Any] | None = None) -> dict[str, Any] | None:
        params = params or []
        _reject_multi_statement(sql)
        bound = _bind_args(sql, params)
        with self._lock:
            try:
                cur = self._conn.execute(sql, bound)
                row = cur.fetchone()
            except sqlite3.Error as err:
                raise QueryError(str(err), 400) from err
        return dict(row) if row is not None else None

    def close(self) -> None:
        with self._lock:
            self._conn.close()


# Defensive belt-and-braces. sqlite3.Connection.execute() only runs the first
# statement and raises ProgrammingError on trailing ones, so multi-statement
# injection is already a no-op — but rejecting at the door produces a clearer
# 400 than "you can only execute one statement at a time".
_STR_LITERAL_RE = re.compile(r"'(?:''|[^'])*'")
_DQ_LITERAL_RE = re.compile(r'"(?:""|[^"])*"')
_PG_PARAM_RE = re.compile(r"\$\d+")


def _strip_literals(sql: str) -> str:
    return _DQ_LITERAL_RE.sub('""', _STR_LITERAL_RE.sub("''", sql))


def _reject_multi_statement(sql: str) -> None:
    if not isinstance(sql, str) or not sql:
        raise QueryError("sql must be a non-empty string", 400)
    if len(sql.encode("utf-8")) > MAX_SQL_BYTES:
        raise QueryError(f"sql exceeds {MAX_SQL_BYTES}-byte limit", 413)
    stripped = _strip_literals(sql)
    if ";" in stripped:
        raise QueryError(
            "sql must not contain ';' (multi-statement queries are not allowed)",
            400,
        )


def _bind_args(sql: str, params: list[Any]) -> list[Any] | dict[str, Any]:
    """Translate Postgres-style ``$N`` placeholders to sqlite3's named bindings.

    The frontend uses ``$N`` (the dialect Tauri's plugin-sql accepts directly).
    sqlite3 treats ``$N`` as a named binding with name "N", so we map the
    positional array to a dict keyed by the digit strings.

    Queries that use anonymous ``?`` placeholders fall through and get the
    positional list unchanged.
    """
    if not params:
        return []
    stripped = _strip_literals(sql)
    if not _PG_PARAM_RE.search(stripped):
        return list(params)
    return {str(i + 1): v for i, v in enumerate(params)}


def _enforce_caps(rows: list[dict[str, Any]]) -> None:
    if len(rows) > MAX_ROWS:
        raise QueryError(
            f"result exceeds {MAX_ROWS}-row cap ({len(rows)} rows)",
            413,
        )
    body = json.dumps(rows, default=str)
    if len(body) > MAX_RESPONSE_BYTES:
        raise QueryError(
            f"result exceeds {MAX_RESPONSE_BYTES}-byte cap ({len(body)} bytes)",
            413,
        )


def open_corpus(corpus_path: Path) -> CorpusHandle:
    if not corpus_path.exists():
        raise FileNotFoundError(f"corpus not found: {corpus_path}")
    return CorpusHandle(corpus_path)
