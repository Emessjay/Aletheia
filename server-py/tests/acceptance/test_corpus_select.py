import os

import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

# Phase 2 routes every /api/corpus query through asyncpg, so these tests
# need a reachable Postgres. The debugger-approve gate may run from a
# checkout whose .nimbus-test-command predates phase 2 and doesn't spin up
# the local postgres — skip cleanly in that case, mirroring the integration
# suite's behavior (and matching AC#9 in the phase-2 spec).
pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set; corpus tests require Postgres",
)


@pytest.mark.asyncio
async def test_select_returns_rows_for_valid_sql():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/corpus/select",
            json={"sql": "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' LIMIT 3", "params": []},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "rows" in body
    assert isinstance(body["rows"], list)


@pytest.mark.asyncio
async def test_select_one_returns_row():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/corpus/selectOne",
            json={"sql": "SELECT 1 as one", "params": []},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert "row" in body
    assert body["row"]["one"] == 1


@pytest.mark.asyncio
async def test_select_rejects_non_string_sql():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/corpus/select", json={"sql": 123, "params": []})
    assert resp.status_code == 400
    assert "error" in resp.json()


@pytest.mark.asyncio
async def test_select_rejects_non_array_params():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/corpus/select",
            json={"sql": "SELECT 1", "params": "not-an-array"},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_select_with_params_substitutes_correctly():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/corpus/select",
            json={"sql": "SELECT $1::int AS x, $2::text AS y", "params": [7, "hi"]},
        )
    assert resp.status_code == 200
    rows = resp.json()["rows"]
    assert len(rows) == 1
    assert rows[0]["x"] == 7
    assert rows[0]["y"] == "hi"
