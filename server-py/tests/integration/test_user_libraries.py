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
async def test_create_then_list_library_for_same_user(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as client:
        create = await client.post("/api/user/libraries", json={"name": "Devotional"})
        assert create.status_code == 200
        created = create.json()
        assert created["name"] == "Devotional"
        assert "id" in created
        assert "created_at" in created

        listing = await client.get("/api/user/libraries")
    assert listing.status_code == 200
    rows = listing.json()
    names = [r["name"] for r in rows]
    assert "Devotional" in names


@pytest.mark.asyncio
async def test_user_b_cannot_see_user_a_libraries(app_with_postgres):
    """The scoping invariant. Two different JWTs see disjoint libraries."""
    from .auth_helpers import auth_client, ALICE_ID, BOB_ID

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        await alice.post("/api/user/libraries", json={"name": "alice-only"})

    async with auth_client(app_with_postgres, BOB_ID) as bob:
        listing = await bob.get("/api/user/libraries")
    names = [r["name"] for r in listing.json()]
    assert "alice-only" not in names


@pytest.mark.asyncio
async def test_user_b_cannot_delete_user_a_library(app_with_postgres):
    """Cross-tenant delete returns 404, NOT 403 — don't leak existence."""
    from .auth_helpers import auth_client, ALICE_ID, BOB_ID

    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        created = (await alice.post("/api/user/libraries", json={"name": "private"})).json()

    async with auth_client(app_with_postgres, BOB_ID) as bob:
        resp = await bob.delete(f"/api/user/libraries/{created['id']}")
    assert resp.status_code == 404

    # And alice's library still exists.
    async with auth_client(app_with_postgres, ALICE_ID) as alice:
        listing = await alice.get("/api/user/libraries")
    assert any(r["id"] == created["id"] for r in listing.json())


# --------------------------------------------------------------------------- #
# Bookmark dedup (migration 0007 + idempotent create)                          #
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_double_adding_a_bookmark_is_idempotent(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    anchor = {
        "work_slug": "bible", "book_slug": "john",
        "chapter": 1, "verse": 2, "translation": "en_bsb",
    }
    async with auth_client(app_with_postgres, ALICE_ID) as client:
        lib = (
            await client.post("/api/user/libraries", json={"name": "DedupLib"})
        ).json()
        first = await client.post(
            "/api/user/bookmarks", json={"library_id": lib["id"], **anchor}
        )
        second = await client.post(
            "/api/user/bookmarks", json={"library_id": lib["id"], **anchor}
        )
        listing = await client.get(
            "/api/user/bookmarks", params={"library_id": lib["id"]}
        )

    assert first.status_code == second.status_code == 200
    # The double-tap returns the same row, not a twin.
    assert first.json()["id"] == second.json()["id"]
    assert len(listing.json()) == 1


@pytest.mark.asyncio
async def test_same_verse_different_translation_is_not_a_duplicate(
    app_with_postgres,
):
    from .auth_helpers import auth_client, ALICE_ID

    base = {"work_slug": "bible", "book_slug": "john", "chapter": 1, "verse": 2}
    async with auth_client(app_with_postgres, ALICE_ID) as client:
        lib = (
            await client.post("/api/user/libraries", json={"name": "SidesLib"})
        ).json()
        bsb = await client.post(
            "/api/user/bookmarks",
            json={"library_id": lib["id"], **base, "translation": "en_bsb"},
        )
        kjv = await client.post(
            "/api/user/bookmarks",
            json={"library_id": lib["id"], **base, "translation": "en_kjv"},
        )
        # NULL translation is its own bucket too (COALESCE in the index).
        plain1 = await client.post(
            "/api/user/bookmarks", json={"library_id": lib["id"], **base}
        )
        plain2 = await client.post(
            "/api/user/bookmarks", json={"library_id": lib["id"], **base}
        )
        listing = await client.get(
            "/api/user/bookmarks", params={"library_id": lib["id"]}
        )

    assert bsb.json()["id"] != kjv.json()["id"]
    assert plain1.json()["id"] == plain2.json()["id"]
    assert len(listing.json()) == 3
