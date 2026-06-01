import os
import time

import pytest

pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("DATABASE_URL"),
        reason="DATABASE_URL not set",
    ),
    pytest.mark.skipif(
        not os.environ.get("SUPABASE_JWT_SECRET"),
        reason="SUPABASE_JWT_SECRET not set",
    ),
]


@pytest.fixture(scope="module")
def app_with_postgres():
    from app.main import app
    return app


@pytest.mark.asyncio
async def test_unauthenticated_is_401(app_with_postgres):
    from .auth_helpers import unauth_client

    async with unauth_client(app_with_postgres) as client:
        resp = await client.post(
            "/api/user/bug-reports",
            json={"platform": "web", "description": "boom"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_invalid_platform_is_422(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        resp = await alice.post(
            "/api/user/bug-reports",
            json={"platform": "mobile", "description": "broke on my phone"},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_empty_description_is_422(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        resp = await alice.post(
            "/api/user/bug-reports",
            json={"platform": "web", "description": ""},
        )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_round_trip(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    before = int(time.time() * 1000)
    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        resp = await alice.post(
            "/api/user/bug-reports",
            json={
                "platform": "local",
                "description": "Audio playback skips on chapter change.",
            },
        )
    after = int(time.time() * 1000)

    assert resp.status_code == 200
    row = resp.json()
    assert row["user_id"] == ALICE_ID
    assert row["platform"] == "local"
    assert row["description"] == "Audio playback skips on chapter change."
    assert "id" in row and row["id"]
    # created_at is ms-epoch, set server-side, near wall-clock.
    assert before <= row["created_at"] <= after
