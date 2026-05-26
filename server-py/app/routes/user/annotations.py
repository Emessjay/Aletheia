"""Combined chapter annotations — used by the reader to load highlights and
notes for a chapter in a single round-trip."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request

from ...auth import get_current_user_id
from ...db import get_pool


_HIGHLIGHT_COLS = (
    "id, user_id, work_slug, book_slug, chapter, verse, translation, "
    "color, start_token, end_token, created_at, updated_at, deleted_at"
)
_NOTE_COLS = (
    "id, user_id, work_slug, book_slug, chapter, verse, body, "
    "created_at, updated_at, deleted_at"
)


def annotations_router() -> APIRouter:
    router = APIRouter()

    @router.get("/chapter")
    async def chapter_annotations(
        request: Request,
        work_slug: str = Query(...),
        book_slug: str = Query(...),
        chapter: int = Query(...),
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            highlights = await conn.fetch(
                f"""
                SELECT {_HIGHLIGHT_COLS}
                  FROM highlight
                 WHERE user_id = $1
                   AND work_slug = $2 AND book_slug = $3
                   AND chapter = $4
                   AND deleted_at IS NULL
                 ORDER BY verse, created_at
                """,
                user_id, work_slug, book_slug, chapter,
            )
            notes = await conn.fetch(
                f"""
                SELECT {_NOTE_COLS}
                  FROM note
                 WHERE user_id = $1
                   AND work_slug = $2 AND book_slug = $3
                   AND chapter = $4
                   AND deleted_at IS NULL
                 ORDER BY verse, created_at
                """,
                user_id, work_slug, book_slug, chapter,
            )
        return {
            "highlights": [dict(r) for r in highlights],
            "notes": [dict(r) for r in notes],
        }

    return router
