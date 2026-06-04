"""End-to-end study-group flows against Postgres.

Mirrors the user-data integration tests: skips without DATABASE_URL +
SUPABASE_JWT_SECRET, drives the app through ``auth_client`` with crafted JWTs.
Tenancy here is by group membership, so we use three distinct users — Alice
(owner), Bob (member), Carol (a second member / non-author).
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

# A third deterministic user — not one the shared conftest wipes, so this
# module owns cleaning up after all three.
CAROL_ID = "00000000-0000-0000-0000-0000000ca501"
_TEST_USERS = (ALICE_ID, BOB_ID, CAROL_ID)

GEN_1_1 = {"work_slug": "bible", "book_slug": "gen", "chapter": 1, "verse": 1}
GEN_1_2 = {"work_slug": "bible", "book_slug": "gen", "chapter": 1, "verse": 2}


@pytest.fixture(scope="module")
def app_with_postgres():
    from app.main import app

    return app


@pytest.fixture(autouse=True)
def _wipe_groups():
    """Delete any groups created by the test users before each test.

    CASCADE removes their memberships, posts, and flags, so every test starts
    from a clean slate regardless of leftovers from a prior local run.
    """
    if not os.environ.get("DATABASE_URL"):
        yield
        return
    import psycopg2

    def _clean():
        conn = psycopg2.connect(os.environ["DATABASE_URL"])
        try:
            with conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT to_regclass('public.study_group') IS NOT NULL"
                    )
                    (exists,) = cur.fetchone()
                    if exists:
                        cur.execute(
                            "DELETE FROM study_group WHERE created_by::text = ANY(%s)",
                            (list(_TEST_USERS),),
                        )
        finally:
            conn.close()

    _clean()
    yield
    _clean()


async def _create_group(app, owner_id, name="Romans study"):
    async with auth_client(app, owner_id) as client:
        resp = await client.post("/api/groups", json={"name": name})
    assert resp.status_code == 200, resp.text
    return resp.json()


async def _join(app, user_id, invite_code):
    async with auth_client(app, user_id) as client:
        return await client.post("/api/groups/join", json={"invite_code": invite_code})


async def _post(app, user_id, group_id, anchor, body="thoughts", parent_id=None):
    payload = {**anchor, "body": body}
    if parent_id:
        payload["parent_id"] = parent_id
    async with auth_client(app, user_id) as client:
        return await client.post(f"/api/groups/{group_id}/posts", json=payload)


# --------------------------------------------------------------------------- #
# Create / join                                                               #
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_create_makes_owner_and_join_makes_member(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    assert group["role"] == "owner"
    assert len(group["invite_code"]) >= 6

    joined = await _join(app, BOB_ID, group["invite_code"])
    assert joined.status_code == 200
    assert joined.json()["role"] == "member"

    # Bob now sees the group in his list.
    async with auth_client(app, BOB_ID) as client:
        mine = await client.get("/api/groups")
    assert any(g["id"] == group["id"] for g in mine.json())


@pytest.mark.asyncio
async def test_join_is_idempotent_and_bad_code_404s(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)

    first = await _join(app, BOB_ID, group["invite_code"])
    second = await _join(app, BOB_ID, group["invite_code"])
    assert first.status_code == second.status_code == 200
    assert second.json()["role"] == "member"  # re-join keeps role

    bad = await _join(app, BOB_ID, "ZZZZ99")
    assert bad.status_code == 404


@pytest.mark.asyncio
async def test_non_member_cannot_read_feed(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    async with auth_client(app, CAROL_ID) as client:
        resp = await client.get(f"/api/groups/{group['id']}/feed", params=GEN_1_1)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_non_member_cannot_post(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    resp = await _post(app, CAROL_ID, group["id"], GEN_1_1)
    assert resp.status_code == 403


# --------------------------------------------------------------------------- #
# Feed + flag + moderation visibility                                         #
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_feed_shows_member_posts(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    await _join(app, BOB_ID, group["invite_code"])

    await _post(app, ALICE_ID, group["id"], GEN_1_1, body="alice here")
    await _post(app, BOB_ID, group["id"], GEN_1_1, body="bob here")

    async with auth_client(app, BOB_ID) as client:
        feed = await client.get(f"/api/groups/{group['id']}/feed", params=GEN_1_1)
    bodies = [p["body"] for p in feed.json()]
    assert "alice here" in bodies and "bob here" in bodies


@pytest.mark.asyncio
async def test_author_cannot_flag_own_post(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    await _join(app, BOB_ID, group["invite_code"])
    post = (await _post(app, BOB_ID, group["id"], GEN_1_1)).json()

    async with auth_client(app, BOB_ID) as client:
        resp = await client.post(f"/api/posts/{post['id']}/flag", json={})
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_member_cannot_remove_but_owner_can(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    await _join(app, BOB_ID, group["invite_code"])
    post = (await _post(app, BOB_ID, group["id"], GEN_1_1)).json()

    # A plain member flags it → flagged.
    async with auth_client(app, ALICE_ID) as client:
        flagged = await client.post(f"/api/posts/{post['id']}/flag", json={})
    assert flagged.status_code == 200
    assert flagged.json()["status"] == "flagged"

    # Bob (member, the author) cannot remove it.
    async with auth_client(app, BOB_ID) as client:
        denied = await client.post(
            f"/api/posts/{post['id']}/moderate", json={"action": "remove"}
        )
    assert denied.status_code == 403

    # Alice (owner) can.
    async with auth_client(app, ALICE_ID) as client:
        removed = await client.post(
            f"/api/posts/{post['id']}/moderate", json={"action": "remove"}
        )
    assert removed.status_code == 200
    assert removed.json()["status"] == "removed"


@pytest.mark.asyncio
async def test_removed_post_visible_to_author_and_owner_not_other_members(
    app_with_postgres,
):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    await _join(app, BOB_ID, group["invite_code"])
    await _join(app, CAROL_ID, group["invite_code"])
    post = (await _post(app, BOB_ID, group["id"], GEN_1_1, body="bob's post")).json()

    async with auth_client(app, ALICE_ID) as client:
        await client.post(
            f"/api/posts/{post['id']}/moderate", json={"action": "remove"}
        )

    def _has_post(feed_json):
        return any(p["id"] == post["id"] for p in feed_json)

    # Carol (other member): gone.
    async with auth_client(app, CAROL_ID) as client:
        carol = await client.get(f"/api/groups/{group['id']}/feed", params=GEN_1_1)
    assert not _has_post(carol.json())

    # Bob (author): still sees his own removed post.
    async with auth_client(app, BOB_ID) as client:
        bob = await client.get(f"/api/groups/{group['id']}/feed", params=GEN_1_1)
    assert _has_post(bob.json())

    # Alice (owner): sees it.
    async with auth_client(app, ALICE_ID) as client:
        alice = await client.get(f"/api/groups/{group['id']}/feed", params=GEN_1_1)
    assert _has_post(alice.json())


@pytest.mark.asyncio
async def test_double_remove_is_409(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    post = (await _post(app, ALICE_ID, group["id"], GEN_1_1)).json()

    async with auth_client(app, ALICE_ID) as client:
        first = await client.post(
            f"/api/posts/{post['id']}/moderate", json={"action": "remove"}
        )
        second = await client.post(
            f"/api/posts/{post['id']}/moderate", json={"action": "remove"}
        )
    assert first.status_code == 200
    assert second.status_code == 409


# --------------------------------------------------------------------------- #
# Replies                                                                     #
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_reply_inherits_anchor_and_cannot_reply_to_removed(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    await _join(app, BOB_ID, group["invite_code"])
    parent = (await _post(app, BOB_ID, group["id"], GEN_1_1)).json()

    # Reply carries a *different* anchor in the body — it must be ignored.
    reply_resp = await _post(
        app, ALICE_ID, group["id"], GEN_1_2, body="re:", parent_id=parent["id"]
    )
    assert reply_resp.status_code == 200
    reply = reply_resp.json()
    assert reply["verse"] == parent["verse"]  # inherited, not GEN_1_2

    # Remove the parent, then a reply attempt is a 409.
    async with auth_client(app, ALICE_ID) as client:
        await client.post(
            f"/api/posts/{parent['id']}/moderate", json={"action": "remove"}
        )
    blocked = await _post(
        app, BOB_ID, group["id"], GEN_1_1, body="late", parent_id=parent["id"]
    )
    assert blocked.status_code == 409


# --------------------------------------------------------------------------- #
# Nontrivial aggregation                                                      #
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_most_discussed_ranks_by_volume_and_applies_threshold(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    await _join(app, BOB_ID, group["invite_code"])

    # gen 1:1 — a thread with two replies (3 posts, 2 participants).
    parent = (await _post(app, ALICE_ID, group["id"], GEN_1_1, body="t")).json()
    await _post(app, BOB_ID, group["id"], GEN_1_1, body="r1", parent_id=parent["id"])
    await _post(app, ALICE_ID, group["id"], GEN_1_1, body="r2", parent_id=parent["id"])
    # gen 1:2 — a single lonely post (below the min_posts threshold).
    await _post(app, ALICE_ID, group["id"], GEN_1_2, body="solo")

    async with auth_client(app, ALICE_ID) as client:
        resp = await client.get(
            f"/api/groups/{group['id']}/discussed", params={"min_posts": 2}
        )
    assert resp.status_code == 200
    rows = resp.json()
    # Only gen 1:1 clears the threshold.
    assert len(rows) == 1
    top = rows[0]
    assert top["verse"] == 1
    assert top["post_count"] == 3
    assert top["participant_count"] == 2


# --------------------------------------------------------------------------- #
# Invite-code rotation                                                        #
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_owner_rotates_code_and_old_code_stops_working(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    old_code = group["invite_code"]

    async with auth_client(app, ALICE_ID) as client:
        resp = await client.post(f"/api/groups/{group['id']}/rotate-code")
    assert resp.status_code == 200, resp.text
    new_code = resp.json()["invite_code"]
    assert new_code != old_code

    # The leaked (old) code no longer admits anyone…
    stale = await _join(app, BOB_ID, old_code)
    assert stale.status_code == 404
    # …but the fresh code does.
    fresh = await _join(app, BOB_ID, new_code)
    assert fresh.status_code == 200
    assert fresh.json()["role"] == "member"


@pytest.mark.asyncio
async def test_member_cannot_rotate_code_but_stays_in_group(app_with_postgres):
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)
    await _join(app, BOB_ID, group["invite_code"])

    async with auth_client(app, BOB_ID) as client:
        resp = await client.post(f"/api/groups/{group['id']}/rotate-code")
    assert resp.status_code == 403

    # The failed attempt must not have changed the code.
    async with auth_client(app, ALICE_ID) as client:
        detail = await client.get(f"/api/groups/{group['id']}")
    assert detail.json()["invite_code"] == group["invite_code"]


@pytest.mark.asyncio
async def test_non_member_rotation_404s_not_403(app_with_postgres):
    # No-leak posture: a non-member can't learn the group exists from the
    # status code, so this is 404 (unknown), not 403 (known but forbidden).
    app = app_with_postgres
    group = await _create_group(app, ALICE_ID)

    async with auth_client(app, CAROL_ID) as client:
        resp = await client.post(f"/api/groups/{group['id']}/rotate-code")
    assert resp.status_code == 404
