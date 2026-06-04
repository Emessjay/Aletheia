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


# --------------------------------------------------------------------------- #
# Hardening: id bounds, duplicate ids, daily flood brake                      #
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_oversized_or_malformed_id_is_422(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        # The id lands in a TEXT primary key — without a bound it would be a
        # second payload channel outside the description's 10k cap.
        oversized = await alice.post(
            "/api/user/bug-reports",
            json={"id": "x" * 41, "platform": "web", "description": "d"},
        )
        malformed = await alice.post(
            "/api/user/bug-reports",
            json={"id": "../../etc", "platform": "web", "description": "d"},
        )
    assert oversized.status_code == 422
    assert malformed.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_id_is_409_not_500(app_with_postgres):
    import os

    import psycopg2

    from .auth_helpers import auth_client, ALICE_ID

    # Self-clean: this module has no global wipe, so a prior local run's row
    # would otherwise make the *first* insert 409 too.
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM bug_report WHERE id = %s", ("bug-dup-1",))
    finally:
        conn.close()

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        first = await alice.post(
            "/api/user/bug-reports",
            json={"id": "bug-dup-1", "platform": "web", "description": "d"},
        )
        second = await alice.post(
            "/api/user/bug-reports",
            json={"id": "bug-dup-1", "platform": "web", "description": "d"},
        )
    assert first.status_code == 200
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_daily_limit_caps_submissions_at_429(app_with_postgres):
    import os

    import psycopg2

    from app.routes.user.bug_reports import DAILY_LIMIT

    from .auth_helpers import auth_client

    # A dedicated user so prior local runs (this module has no global wipe)
    # can't make the count nondeterministic.
    cap_user = "00000000-0000-0000-0000-00000000be09"
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM bug_report WHERE user_id = %s", (cap_user,)
                )
    finally:
        conn.close()

    async with auth_client(app_with_postgres, cap_user) as client:
        for i in range(DAILY_LIMIT):
            ok = await client.post(
                "/api/user/bug-reports",
                json={"platform": "web", "description": f"report {i}"},
            )
            assert ok.status_code == 200, ok.text
        over = await client.post(
            "/api/user/bug-reports",
            json={"platform": "web", "description": "one too many"},
        )
    assert over.status_code == 429
