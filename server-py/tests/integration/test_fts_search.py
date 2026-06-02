"""Full-text search returns meaningful results post-migration.

Whether you implemented FTS via server-side query rewriting or a typed
/api/corpus/search endpoint, the user-visible behavior must hold: a
search for "love" returns many verses; a search for "Bethlehem" returns
a focused set including Matt 2 / Luke 2 / Micah 5.

If you went with option (b) (typed endpoint), adapt the test calls
below to hit /api/corpus/search instead of /api/corpus/select. Keep
the assertions.
"""
import os
import pytest
from httpx import AsyncClient, ASGITransport

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; integration tests require a running Postgres",
)


@pytest.fixture(scope="module", autouse=True)
def _require_corpus_ingested():
    if not os.environ.get("ALETHEIA_CORPUS_INGESTED"):
        pytest.skip("corpus not ingested (source SQLite unavailable in this env)")


@pytest.fixture(scope="module")
def app_with_postgres():
    from app.main import app
    return app


@pytest.mark.asyncio
async def test_fts_love_returns_many_hits(app_with_postgres):
    """"love" is a high-frequency search term; expect at least a few hundred matches."""
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Use whichever FTS route you wired. This template uses /api/corpus/select
        # with a verse_fts MATCH-shaped SQL; rewrite for /api/corpus/search if
        # that's the route you picked.
        resp = await client.post(
            "/api/corpus/select",
            json={
                "sql": "SELECT v.* FROM verse v WHERE verse_fts MATCH $1 LIMIT 1000",
                "params": ["love"],
            },
        )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    assert len(rows) >= 100, f"expected many 'love' hits, got {len(rows)}"


@pytest.mark.asyncio
async def test_fts_bethlehem_returns_focused_set(app_with_postgres):
    """"Bethlehem" is rare enough that the search should return tens, not thousands."""
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/corpus/select",
            json={
                "sql": "SELECT v.* FROM verse v WHERE verse_fts MATCH $1 LIMIT 500",
                "params": ["Bethlehem"],
            },
        )
    assert resp.status_code == 200, resp.text
    rows = resp.json()["rows"]
    # Bethlehem appears in tens of verses across both testaments
    assert 5 <= len(rows) <= 200, f"unexpected 'Bethlehem' hit count: {len(rows)}"
