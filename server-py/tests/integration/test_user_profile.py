"""Profile (display name) flows against Postgres.

Two halves: the /api/user/profile CRUD itself, and the read-time join that
surfaces ``author_name`` on group posts — including the design-decision case
this feature exists for: a rename propagates to every already-written post.
"""
import os

import pytest

from .auth_helpers import ALICE_ID, BOB_ID, auth_client

pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("DATABASE_URL"), reason="DATABASE_URL not set"
    ),
    pytest.mark.skipif(
        not os.environ.get("SUPABASE_JWT_SECRET"), reason="SUPABASE_JWT_SECRET not set"
    ),
]

_TEST_USERS = (ALICE_ID, BOB_ID)

GEN_1_1 = {"work_slug": "bible", "book_slug": "gen", "chapter": 1, "verse": 1}


@pytest.fixture(scope="module")
def app_with_postgres():
    from app.main import app

    return app


@pytest.fixture(autouse=True)
def _wipe_profiles_and_groups():
    """Start each test from a clean slate for the deterministic test users."""
    if not os.environ.get("DATABASE_URL"):
        yield
        return
    import psycopg2

    def _clean():
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        try:
            with conn:
                with conn.cursor() as cur:
                    for table, col in (
                        ("study_group", "created_by"),
                        ("profile", "user_id"),
                    ):
                        cur.execute(
                            f"SELECT to_regclass('public.{table}') IS NOT NULL"
                        )
                        (exists,) = cur.fetchone()
                        if exists:
                            cur.execute(
                                f"DELETE FROM {table} WHERE {col}::text = ANY(%s)",
                                (list(_TEST_USERS),),
                            )
        finally:
            conn.close()

    _clean()
    yield
    _clean()


@pytest.mark.asyncio
async def test_profile_roundtrip_and_upsert(app_with_postgres):
    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        # No profile yet.
        miss = await alice.get("/api/user/profile")
        assert miss.status_code == 404

        put = await alice.put("/api/user/profile", json={"display_name": "Alice A."})
        assert put.status_code == 200, put.text
        assert put.json()["display_name"] == "Alice A."

        got = await alice.get("/api/user/profile")
        assert got.status_code == 200
        assert got.json()["display_name"] == "Alice A."

        # Renaming upserts the same row.
        await alice.put("/api/user/profile", json={"display_name": "Alice Ž."})
        got = await alice.get("/api/user/profile")
        assert got.json()["display_name"] == "Alice Ž."

    # Bob's namespace is his own.
    async with auth_client(app_with_postgres, BOB_ID) as bob:
        miss = await bob.get("/api/user/profile")
        assert miss.status_code == 404


@pytest.mark.asyncio
async def test_profile_rejects_blank_and_oversize_names(app_with_postgres):
    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        too_long = await alice.put(
            "/api/user/profile", json={"display_name": "x" * 51}
        )
        assert too_long.status_code == 422

        blank = await alice.put("/api/user/profile", json={"display_name": "   "})
        assert blank.status_code == 422

        empty = await alice.put("/api/user/profile", json={"display_name": ""})
        assert empty.status_code == 422


@pytest.mark.asyncio
async def test_feed_carries_author_name_and_rename_propagates(app_with_postgres):
    # Alice (named) owns a group; Bob (no profile) joins and posts too.
    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        await alice.put("/api/user/profile", json={"display_name": "Alice A."})
        group = (await alice.post("/api/groups", json={"name": "Genesis study"})).json()
        post = await alice.post(
            f"/api/groups/{group['id']}/posts",
            json={**GEN_1_1, "body": "In the beginning…"},
        )
        assert post.status_code == 200, post.text
        # create_post response carries the caller's name too.
        assert post.json()["author_name"] == "Alice A."

    async with auth_client(app_with_postgres, BOB_ID) as bob:
        joined = await bob.post(
            "/api/groups/join", json={"invite_code": group["invite_code"]}
        )
        assert joined.status_code == 200, joined.text
        bob_post = await bob.post(
            f"/api/groups/{group['id']}/posts",
            json={**GEN_1_1, "body": "A question about v1"},
        )
        # No profile yet — author_name is null, not an error.
        assert bob_post.json()["author_name"] is None

        feed = (
            await bob.get(f"/api/groups/{group['id']}/feed", params=GEN_1_1)
        ).json()
        by_body = {p["body"]: p for p in feed}
        assert by_body["In the beginning…"]["author_name"] == "Alice A."
        assert by_body["A question about v1"]["author_name"] is None

    # The join resolves at read time: Alice renames, her EXISTING post
    # reflects it with no write to group_post.
    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        await alice.put("/api/user/profile", json={"display_name": "Prof. Alice"})
        feed = (
            await alice.get(f"/api/groups/{group['id']}/feed", params=GEN_1_1)
        ).json()
        by_body = {p["body"]: p for p in feed}
        assert by_body["In the beginning…"]["author_name"] == "Prof. Alice"

    # Thread view (single post + replies) carries the name as well.
    async with auth_client(app_with_postgres, BOB_ID) as bob:
        thread = (await bob.get(f"/api/posts/{post.json()['id']}")).json()
        assert thread["post"]["author_name"] == "Prof. Alice"
