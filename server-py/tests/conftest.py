"""Top-level pytest fixtures shared by acceptance + integration suites.

Phase 2 puts the corpus in Postgres. Both suites need:
  - ``app.*`` importable
  - a ``python`` shim (some seeded tests use the bare command name)
  - ``ALETHEIA_CORPUS_PATH`` pointing at a non-empty SQLite file
  - the schema migrated and the corpus ingested once per test session,
    when ``DATABASE_URL`` is set

If ``DATABASE_URL`` is unset, tests that need Postgres are individually
marked skip in their own files; the bring-up fixture below is a no-op.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_SERVER_PY = Path(__file__).resolve().parents[1]
if str(_SERVER_PY) not in sys.path:
    sys.path.insert(0, str(_SERVER_PY))


# Resolve a corpus path at collection time. The worktree's
# data/Aletheia.sqlite is the 0-byte placeholder (intentionally untracked —
# 600 MB lives only in the main checkout), so fall back to the main checkout
# automatically when the worktree's copy is empty.
#
# Returns the resolved Path when a real SQLite is found (and sets
# ALETHEIA_CORPUS_PATH as a side-effect), or None when no corpus is available.
def _resolve_corpus_path() -> "Path | None":
    existing = os.environ.get("ALETHEIA_CORPUS_PATH")
    if existing:
        p = Path(existing)
        return p if p.exists() and p.stat().st_size > 0 else None
    repo_root = _SERVER_PY.parent
    candidates = [
        repo_root / "data" / "Aletheia.sqlite",
        repo_root.parent / "Aletheia" / "data" / "Aletheia.sqlite",
    ]
    for c in candidates:
        if c.exists() and c.stat().st_size > 0:
            os.environ["ALETHEIA_CORPUS_PATH"] = str(c)
            return c
    return None


_CORPUS_PATH = _resolve_corpus_path()


@pytest.fixture(scope="session", autouse=True)
def _python_on_path(tmp_path_factory):
    if shutil.which("python"):
        return
    shim_dir = tmp_path_factory.mktemp("python-shim")
    (shim_dir / "python").symlink_to(sys.executable)
    os.environ["PATH"] = f"{shim_dir}{os.pathsep}{os.environ['PATH']}"


def _has_corpus_data(url: str) -> bool:
    """Returns True if the verse table is already populated.

    Lets repeated local test runs skip the ~75s reingest — the dedicated
    ingest tests still call ingest_corpus directly, so we don't lose
    coverage of that path.
    """
    try:
        import psycopg2
    except ImportError:
        return False
    try:
        conn = psycopg2.connect(url)
    except psycopg2.OperationalError:
        return False
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT to_regclass('public.verse') IS NOT NULL"
            )
            (has_table,) = cur.fetchone()
            if not has_table:
                return False
            cur.execute("SELECT COUNT(*) FROM verse")
            (n,) = cur.fetchone()
            return n > 0
    finally:
        conn.close()


@pytest.fixture(scope="session", autouse=True)
def _migrate_and_ingest(_python_on_path):
    """Run alembic + ingest_corpus once per test session.

    Always runs alembic (every test needs a migrated schema).  Ingest is
    conditional: skipped when no real corpus SQLite is available (CI) or
    when the verse table is already populated (repeated local runs).

    Sets ALETHEIA_CORPUS_INGESTED=1 after a successful ingest so that
    corpus-data test modules can skip cleanly when ingest was not run.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        return
    subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=str(_SERVER_PY),
        check=True,
    )
    if not _CORPUS_PATH:
        # No corpus SQLite available in this environment — skip ingest.
        # Corpus-data tests gate themselves on ALETHEIA_CORPUS_INGESTED.
        return
    if _has_corpus_data(url):
        os.environ["ALETHEIA_CORPUS_INGESTED"] = "1"
        return
    subprocess.run(
        [sys.executable, "-m", "app.scripts.ingest_corpus"],
        cwd=str(_SERVER_PY),
        check=True,
    )
    os.environ["ALETHEIA_CORPUS_INGESTED"] = "1"
