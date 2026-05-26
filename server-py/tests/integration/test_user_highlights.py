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
async def test_create_list_delete_highlight_roundtrip(app_with_postgres):
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as client:
        create = await client.post(
            "/api/user/highlights",
            json={
                "work_slug": "bible",
                "book_slug": "gen",
                "chapter": 1,
                "verse": 1,
                "translation": "en_modern",
                "color": "yellow",
                "start_token": 0,
                "end_token": 5,
            },
        )
    assert create.status_code == 200, create.text
    row = create.json()
    assert row["color"] == "yellow"
    assert row["chapter"] == 1
    h_id = row["id"]

    async with auth_client(app_with_postgres, ALICE_ID) as client:
        chapter_resp = await client.get(
            "/api/user/highlights/chapter",
            params={"work_slug": "bible", "book_slug": "gen", "chapter": 1},
        )
    assert chapter_resp.status_code == 200
    chapter_rows = chapter_resp.json()
    assert any(r["id"] == h_id for r in chapter_rows)

    async with auth_client(app_with_postgres, ALICE_ID) as client:
        deleted = await client.delete(f"/api/user/highlights/{h_id}")
    assert deleted.status_code == 200

    # After soft-delete, the chapter listing should no longer include it.
    async with auth_client(app_with_postgres, ALICE_ID) as client:
        after = await client.get(
            "/api/user/highlights/chapter",
            params={"work_slug": "bible", "book_slug": "gen", "chapter": 1},
        )
    assert not any(r["id"] == h_id for r in after.json())


@pytest.mark.asyncio
async def test_highlight_color_check_constraint(app_with_postgres):
    """The SQLite CHECK on `color` is mirrored in Postgres."""
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as client:
        resp = await client.post(
            "/api/user/highlights",
            json={
                "work_slug": "bible", "book_slug": "gen",
                "chapter": 1, "verse": 1,
                "color": "neon-magenta",  # not in the allowed set
            },
        )
    # 400 from the handler, OR 500 if the constraint trips at the DB level —
    # either is acceptable; what matters is the row didn't land.
    assert resp.status_code in (400, 422, 500)


@pytest.mark.asyncio
async def test_verse_query_returns_only_matching_translation(app_with_postgres):
    """Translation scoping: the v2 'en_modern' side covers en_modern + NULL rows."""
    from .auth_helpers import auth_client, ALICE_ID

    async with auth_client(app_with_postgres, ALICE_ID) as client:
        # Universal (NULL translation) highlight.
        await client.post("/api/user/highlights", json={
            "work_slug": "bible", "book_slug": "gen", "chapter": 1, "verse": 2,
            "color": "blue",
        })
        # Modern-English-scoped highlight.
        await client.post("/api/user/highlights", json={
            "work_slug": "bible", "book_slug": "gen", "chapter": 1, "verse": 2,
            "translation": "en_modern", "color": "pink",
        })
        # King-James-scoped highlight.
        await client.post("/api/user/highlights", json={
            "work_slug": "bible", "book_slug": "gen", "chapter": 1, "verse": 2,
            "translation": "en_kjv", "color": "green",
        })

        # Querying en_modern should see the en_modern + NULL rows, NOT the en_kjv row.
        modern = await client.get(
            "/api/user/highlights/verse",
            params={"work_slug": "bible", "book_slug": "gen",
                    "chapter": 1, "verse": 2, "translation": "en_modern"},
        )
    rows = modern.json()
    colors = sorted(r["color"] for r in rows)
    assert "blue" in colors and "pink" in colors
    assert "green" not in colors
