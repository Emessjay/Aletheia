"""Highlight CRUD scoped by user_id.

Verse-side query semantics (mirrors the v2 frontend rule from
``0002_per_side_annotations.sql``): a row whose ``translation`` is NULL is
treated as "universal" and shows up on every side. A query for
``translation=en_modern`` therefore returns rows where translation is
``en_modern`` *or* NULL; a query for any other translation matches only
exact-equal rows.
"""
from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import new_id, now_ms


HighlightColor = Literal["yellow", "green", "blue", "pink", "purple", "orange"]


class HighlightCreate(BaseModel):
    id: Optional[str] = None
    work_slug: str = Field(min_length=1)
    book_slug: str = Field(min_length=1)
    chapter: int
    verse: int
    translation: Optional[str] = None
    color: HighlightColor
    start_token: Optional[int] = None
    end_token: Optional[int] = None


_SELECT_COLS = (
    "id, user_id, work_slug, book_slug, chapter, verse, translation, "
    "color, start_token, end_token, created_at, updated_at, deleted_at"
)


def highlights_router() -> APIRouter:
    router = APIRouter()

    @router.get("/verse")
    async def list_verse_highlights(
        request: Request,
        work_slug: str = Query(...),
        book_slug: str = Query(...),
        chapter: int = Query(...),
        verse: int = Query(...),
        translation: Optional[str] = Query(default=None),
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            if translation == "en_modern":
                rows = await conn.fetch(
                    f"""
                    SELECT {_SELECT_COLS}
                      FROM highlight
                     WHERE user_id = $1
                       AND work_slug = $2 AND book_slug = $3
                       AND chapter = $4 AND verse = $5
                       AND (translation = $6 OR translation IS NULL)
                       AND deleted_at IS NULL
                     ORDER BY created_at
                    """,
                    user_id, work_slug, book_slug, chapter, verse, translation,
                )
            elif translation is None:
                rows = await conn.fetch(
                    f"""
                    SELECT {_SELECT_COLS}
                      FROM highlight
                     WHERE user_id = $1
                       AND work_slug = $2 AND book_slug = $3
                       AND chapter = $4 AND verse = $5
                       AND translation IS NULL
                       AND deleted_at IS NULL
                     ORDER BY created_at
                    """,
                    user_id, work_slug, book_slug, chapter, verse,
                )
            else:
                rows = await conn.fetch(
                    f"""
                    SELECT {_SELECT_COLS}
                      FROM highlight
                     WHERE user_id = $1
                       AND work_slug = $2 AND book_slug = $3
                       AND chapter = $4 AND verse = $5
                       AND translation = $6
                       AND deleted_at IS NULL
                     ORDER BY created_at
                    """,
                    user_id, work_slug, book_slug, chapter, verse, translation,
                )
        return [dict(r) for r in rows]

    @router.get("/chapter")
    async def list_chapter_highlights(
        request: Request,
        work_slug: str = Query(...),
        book_slug: str = Query(...),
        chapter: int = Query(...),
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT {_SELECT_COLS}
                  FROM highlight
                 WHERE user_id = $1
                   AND work_slug = $2 AND book_slug = $3
                   AND chapter = $4
                   AND deleted_at IS NULL
                 ORDER BY verse, created_at
                """,
                user_id, work_slug, book_slug, chapter,
            )
        return [dict(r) for r in rows]

    @router.post("")
    async def create_highlight(
        body: HighlightCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        row_id = body.id or new_id()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                INSERT INTO highlight (id, user_id, work_slug, book_slug,
                                       chapter, verse, translation, color,
                                       start_token, end_token,
                                       created_at, updated_at, deleted_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, NULL)
                RETURNING {_SELECT_COLS}
                """,
                row_id, user_id, body.work_slug, body.book_slug,
                body.chapter, body.verse, body.translation, body.color,
                body.start_token, body.end_token, now,
            )
        return dict(row)

    @router.delete("/{highlight_id}")
    async def delete_highlight(
        highlight_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE highlight
                   SET deleted_at = $1, updated_at = $1
                 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
                RETURNING id
                """,
                now, highlight_id, user_id,
            )
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return {"id": row["id"]}

    return router
