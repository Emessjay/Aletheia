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


@pytest.fixture(scope="module", autouse=True)
def _require_corpus_ingested():
    if not os.environ.get("ALETHEIA_CORPUS_INGESTED"):
        pytest.skip("corpus not ingested (source SQLite unavailable in this env)")


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

    # Every base table the web ingest actively populates should have rows
    # post-ingest. `word` is back in the ingest (Strong's interlinear
    # restored on web). The three trimmed tables (`xref`, `section`,
    # `citation`) are deliberately skipped to fit Supabase's free-tier disk
    # cap (see ingest_corpus.py for the rationale) — they're asserted empty
    # in test_ingest_skips_trimmed_tables below. `work` is kept because it's
    # tiny (~340 rows) and various downstream queries reference it.
    # We don't pin specific counts either, because the SQLite source may
    # be rebuilt over time — only the structural invariant that the
    # table is non-empty.
    for table in ("book", "chapter", "verse", "word", "work", "strongs"):
        n = asyncio.run(_count(table))
        assert n > 0, f"{table} is empty after ingest"


def test_ingest_skips_trimmed_tables():
    """The trimmed tables exist in the schema but stay empty after ingest.

    The web ingest deliberately omits `xref` (~344k rows), `section` (~122k
    rows of Schaff/Aquinas patristic bodies), and `citation` (FK → section;
    empty in the source anyway) so the Postgres footprint fits Supabase's
    500MB free tier. (`word` is no longer trimmed — Strong's interlinear is
    restored on web; see test_ingest_loads_every_corpus_table.) The schema
    still defines all three tables so frontend queries against them return []
    rather than erroring; this test pins that contract.
    """
    subprocess.run(["alembic", "upgrade", "head"], cwd="server-py", check=True)
    subprocess.run(
        ["python", "-m", "app.scripts.ingest_corpus"],
        cwd="server-py", check=True, env={**os.environ},
    )
    for table in ("xref", "section", "citation"):
        # to_regclass is null when the table doesn't exist; this asserts
        # both "table is defined" and "table is empty" in one shot.
        async def check(t=table):
            conn = await asyncpg.connect(os.environ["DATABASE_URL"])
            try:
                exists = await conn.fetchval(
                    "SELECT to_regclass($1) IS NOT NULL", t,
                )
                count = await conn.fetchval(f"SELECT COUNT(*) FROM {t}")
                return exists, count
            finally:
                await conn.close()
        exists, count = asyncio.run(check())
        assert exists, f"{table} should be defined in the schema"
        assert count == 0, f"{table} should be empty on the web ingest"


def test_ingest_is_idempotent():
    """Running ingest twice produces the same row counts (no duplicates)."""
    subprocess.run(["alembic", "upgrade", "head"], cwd="server-py", check=True)
    subprocess.run(
        ["python", "-m", "app.scripts.ingest_corpus"],
        cwd="server-py", check=True, env={**os.environ},
    )
    counts_first = {
        t: asyncio.run(_count(t))
        for t in ("book", "chapter", "verse", "strongs")
    }
    subprocess.run(
        ["python", "-m", "app.scripts.ingest_corpus"],
        cwd="server-py", check=True, env={**os.environ},
    )
    counts_second = {
        t: asyncio.run(_count(t))
        for t in ("book", "chapter", "verse", "strongs")
    }
    assert counts_first == counts_second, (
        f"ingest produced different counts on second run: "
        f"first={counts_first} second={counts_second}"
    )
