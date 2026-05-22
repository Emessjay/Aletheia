"""ingest_corpus.py loads the SQLite corpus into Postgres cleanly."""
import os
import subprocess
import asyncio
import pytest
import asyncpg

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; integration tests require a running Postgres",
)


async def _count(table: str) -> int:
    conn = await asyncpg.connect(os.environ["DATABASE_URL"])
    try:
        return await conn.fetchval(f"SELECT COUNT(*) FROM {table}")
    finally:
        await conn.close()


def test_ingest_loads_every_corpus_table():
    """After ingest, every base corpus table has rows."""
    # Apply migrations first.
    subprocess.run(["alembic", "upgrade", "head"], cwd="server-py", check=True)
    # Run the ingest. Resolve the script via its module path so the worker
    # is free to organize the script however they like, as long as it's
    # importable as `app.scripts.ingest_corpus` or runnable via a
    # documented command. If they prefer a CLI entry point, adapt this
    # test to call that instead — just keep the assertions intact.
    result = subprocess.run(
        ["python", "-m", "app.scripts.ingest_corpus"],
        cwd="server-py",
        capture_output=True,
        text=True,
        env={**os.environ},
    )
    assert result.returncode == 0, (
        f"ingest failed: stdout={result.stdout} stderr={result.stderr}"
    )

    # Every base table the corpus actively populates should have rows
    # post-ingest. `citation` exists in the schema but is empty in the
    # current source (verified via sqlite3); we don't assert on it.
    # We don't pin specific counts either, because the SQLite source may
    # be rebuilt over time — only the structural invariant that the
    # table is non-empty.
    for table in ("book", "chapter", "verse", "word", "work", "section",
                  "strongs", "xref"):
        n = asyncio.run(_count(table))
        assert n > 0, f"{table} is empty after ingest"


def test_ingest_is_idempotent():
    """Running ingest twice produces the same row counts (no duplicates)."""
    subprocess.run(["alembic", "upgrade", "head"], cwd="server-py", check=True)
    subprocess.run(
        ["python", "-m", "app.scripts.ingest_corpus"],
        cwd="server-py", check=True, env={**os.environ},
    )
    counts_first = {
        t: asyncio.run(_count(t))
        for t in ("book", "chapter", "verse", "word")
    }
    subprocess.run(
        ["python", "-m", "app.scripts.ingest_corpus"],
        cwd="server-py", check=True, env={**os.environ},
    )
    counts_second = {
        t: asyncio.run(_count(t))
        for t in ("book", "chapter", "verse", "word")
    }
    assert counts_first == counts_second, (
        f"ingest produced different counts on second run: "
        f"first={counts_first} second={counts_second}"
    )
