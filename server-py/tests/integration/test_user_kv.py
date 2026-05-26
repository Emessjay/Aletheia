import os
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
async def test_kv_get_set_per_user(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID, BOB_ID

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        # Initially empty
        miss = await alice.get("/api/user/kv/theme")
        assert miss.status_code == 404

        put = await alice.put("/api/user/kv/theme", json={"value": "dark"})
        assert put.status_code in (200, 204)

        got = await alice.get("/api/user/kv/theme")
        assert got.status_code == 200
        assert got.json()["value"] == "dark"

    # Bob has his own KV namespace — same key, no leak.
    async with auth_client(app_with_postgres, BOB_ID) as bob:
        miss = await bob.get("/api/user/kv/theme")
        assert miss.status_code == 404

        await bob.put("/api/user/kv/theme", json={"value": "light"})
        got = await bob.get("/api/user/kv/theme")
        assert got.json()["value"] == "light"

    # Alice's value unchanged.
    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        got = await alice.get("/api/user/kv/theme")
        assert got.json()["value"] == "dark"


@pytest.mark.asyncio
async def test_kv_put_upserts_overwriting_existing_value(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        await alice.put("/api/user/kv/last_chapter", json={"value": "genesis/1"})
        await alice.put("/api/user/kv/last_chapter", json={"value": "exodus/3"})
        got = await alice.get("/api/user/kv/last_chapter")
    assert got.json()["value"] == "exodus/3"
