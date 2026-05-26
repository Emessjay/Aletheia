"""JWT verification contract."""
import os
import pytest
import time

from jose import jwt
from httpx import AsyncClient, ASGITransport

pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("DATABASE_URL"),
        reason="DATABASE_URL not set; integration tests require Postgres",
    ),
    pytest.mark.skipif(
        not os.environ.get("SUPABASE_JWT_SECRET"),
        reason="SUPABASE_JWT_SECRET not set; auth tests require a signing secret",
    ),
]


@pytest.fixture(scope="module")
def app_with_postgres():
    from app.main import app
    return app


@pytest.mark.asyncio
async def test_missing_authorization_header_returns_401(app_with_postgres):
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_malformed_token_returns_401(app_with_postgres):
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test",
                          headers={"Authorization": "Bearer not-a-jwt"}) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bad_signature_returns_401(app_with_postgres):
    bad_token = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000001", "aud": "authenticated",
         "exp": int(time.time()) + 3600},
        "wrong-secret", algorithm="HS256",
    )
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test",
                          headers={"Authorization": f"Bearer {bad_token}"}) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_wrong_audience_returns_401(app_with_postgres):
    token = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000001", "aud": "service_role",
         "exp": int(time.time()) + 3600},
        os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256",
    )
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test",
                          headers={"Authorization": f"Bearer {token}"}) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_expired_token_returns_401(app_with_postgres):
    token = jwt.encode(
        {"sub": "00000000-0000-0000-0000-000000000001", "aud": "authenticated",
         "exp": int(time.time()) - 1},
        os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256",
    )
    transport = ASGITransport(app=app_with_postgres)
    async with AsyncClient(transport=transport, base_url="http://test",
                          headers={"Authorization": f"Bearer {token}"}) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_valid_token_lets_user_through(app_with_postgres):
    """A well-formed JWT signed with the right secret reaches the handler."""
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as client:
        resp = await client.get("/api/user/libraries")
    # The handler runs and returns an (empty) list, even for a brand-new user.
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
