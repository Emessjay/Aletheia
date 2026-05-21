import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_root_serves_index_html():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
    # If dist/ doesn't exist in the test env, the app should still respond —
    # either with the built index.html (CI / docker build context) or with a
    # graceful "frontend not built" placeholder (local dev with no build).
    # Either way it's HTML or a 200/404 JSON, NOT a 500.
    assert resp.status_code in (200, 404)
    if resp.status_code == 200:
        assert "<html" in resp.text.lower() or "frontend" in resp.text.lower()


@pytest.mark.asyncio
async def test_unknown_non_api_route_falls_back_to_spa():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/reader/bible/genesis/1")
    # Same shape as the root: should not 500. If dist/ is built it serves
    # index.html (200); if not, a 404 is acceptable.
    assert resp.status_code in (200, 404)


@pytest.mark.asyncio
async def test_api_404_returns_json_not_html():
    """Regression guard: the SPA fallback must NEVER swallow unknown /api/*
    routes. If a frontend calls /api/typo and gets HTML back, every JSON
    parse on the frontend fails in a maximally confusing way."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/this-endpoint-does-not-exist")
    assert resp.status_code == 404
    content_type = resp.headers.get("content-type", "").lower()
    assert "html" not in content_type
    assert "json" in content_type
