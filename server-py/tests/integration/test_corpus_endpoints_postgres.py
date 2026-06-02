"""The /api/corpus endpoints serve correct shapes when backed by Postgres.

These are the phase-1 contract tests re-run against the Postgres-backed
implementation. They share the existing acceptance tests' assertions; the
difference is the storage layer.
"""
import os
import pytest
from httpx import AsyncClient, ASGITransport

pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("DATABASE_URL"),
        reason="DATABASE_URL not set; integration tests require a running Postgres",
    ),
    pytest.mark.skipif(
        not os.environ.get("ALETHEIA_CORPUS_PATH"),
        reason="ALETHEIA_CORPUS_PATH not set; corpus SQLite unavailable in CI",
    ),
]


@pytest.fixture(scope="module")
def app_with_postgres():
    """Return the FastAPI app configured to use Postgres."""
    # If your app reads DATABASE_URL at import time, the env var must
    # already be set when this fixture imports it. Test runners that
    # source .env automatically (pytest-dotenv) will Just Work; CI
    # passes DATABASE_URL via env.
    from app.main import app
    return app


@pytest.mark.asyncio
async def test_select_one_returns_row_from_postgres(app_with_postgres):
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/corpus/selectOne",
            json={"sql": "SELECT 1 AS one", "params": []},
        )
    assert resp.status_code == 200
    assert resp.json()["row"]["one"] == 1


@pytest.mark.asyncio
async def test_select_books_returns_at_least_66(app_with_postgres):
    """The BSB Protestant canon has 66 books.

    The corpus stores per-translation rows in ``book``: ``book.language`` is
    the translation id (``en_bsb``, ``en_kjv``, ``gk``, ``he``, …), NOT a
    bare language code. ``book.slug`` is abbreviated (``gen``, ``rev``)
    rather than the full name. Both invariants come from the SQLite
    source and the Postgres port should preserve them verbatim.
    """
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/corpus/select",
            json={
                "sql": "SELECT * FROM book WHERE language = $1 ORDER BY order_index",
                "params": ["en_bsb"],
            },
        )
    assert resp.status_code == 200
    rows = resp.json()["rows"]
    # BSB ships the Protestant canon — 66 books.
    assert len(rows) == 66
    slugs = [r["slug"] for r in rows]
    assert "gen" in slugs
    assert "rev" in slugs


@pytest.mark.asyncio
async def test_select_genesis_chapter_1_has_31_verses(app_with_postgres):
    """Genesis 1 has 31 verses in BSB. ``book.language`` is the translation
    id (``en_bsb``) and ``book.slug`` is the abbreviated form (``gen``)."""
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Resolve the book, then chapter, then verses — mirroring the
        # frontend's typical fetch sequence.
        book_resp = await client.post(
            "/api/corpus/selectOne",
            json={
                "sql": "SELECT * FROM book WHERE language = $1 AND slug = $2",
                "params": ["en_bsb", "gen"],
            },
        )
        book = book_resp.json()["row"]
        chapter_resp = await client.post(
            "/api/corpus/selectOne",
            json={
                "sql": "SELECT * FROM chapter WHERE book_id = $1 AND number = $2",
                "params": [book["id"], 1],
            },
        )
        chapter = chapter_resp.json()["row"]
        verses_resp = await client.post(
            "/api/corpus/select",
            json={
                "sql": "SELECT * FROM verse WHERE chapter_id = $1 ORDER BY number",
                "params": [chapter["id"]],
            },
        )
    rows = verses_resp.json()["rows"]
    assert len(rows) == 31
