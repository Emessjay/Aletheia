"""Bookmark CRUD scoped by user_id."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import new_id, now_ms


_SELECT_COLS = (
    "id, user_id, library_id, work_slug, book_slug, chapter, verse, "
    "translation, label, created_at, updated_at, deleted_at"
)


class BookmarkCreate(BaseModel):
    id: Optional[str] = None
    library_id: str = Field(min_length=1)
    work_slug: str = Field(min_length=1)
    book_slug: Optional[str] = None
    chapter: Optional[int] = None
    verse: Optional[int] = None
    translation: Optional[str] = None
    label: Optional[str] = None


def bookmarks_router() -> APIRouter:
    router = APIRouter()

    @router.get("")
    async def list_bookmarks(
        request: Request,
        library_id: str = Query(...),
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT {_SELECT_COLS}
                  FROM bookmark
                 WHERE user_id = $1 AND library_id = $2
                   AND deleted_at IS NULL
                 ORDER BY created_at
                """,
                user_id, library_id,
            )
        return [dict(r) for r in rows]

    @router.post("")
    async def create_bookmark(
        body: BookmarkCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        row_id = body.id or new_id()
        async with pool.acquire() as conn:
            # Idempotent create: the partial unique index from migration 0007
            # (one live bookmark per user/library/anchor) turns a double-tap
            # into DO NOTHING, and we hand back the existing row so the
            # client sees the same shape either way.
            row = await conn.fetchrow(
                f"""
                INSERT INTO bookmark (id, user_id, library_id, work_slug,
                                      book_slug, chapter, verse, translation,
                                      label, created_at, updated_at,
                                      deleted_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, NULL)
                ON CONFLICT (user_id, library_id, work_slug,
                             COALESCE(book_slug, ''),
                             COALESCE(chapter, -1),
                             COALESCE(verse, -1),
                             COALESCE(translation, ''))
                      WHERE deleted_at IS NULL
                DO NOTHING
                RETURNING {_SELECT_COLS}
                """,
                row_id, user_id, body.library_id, body.work_slug,
                body.book_slug, body.chapter, body.verse, body.translation,
                body.label, now,
            )
            if row is None:
                row = await conn.fetchrow(
                    f"""
                    SELECT {_SELECT_COLS}
                      FROM bookmark
                     WHERE user_id = $1 AND library_id = $2
                       AND work_slug = $3
                       AND COALESCE(book_slug, '') = COALESCE($4, '')
                       AND COALESCE(chapter, -1) = COALESCE($5, -1)
                       AND COALESCE(verse, -1) = COALESCE($6, -1)
                       AND COALESCE(translation, '') = COALESCE($7, '')
                       AND deleted_at IS NULL
                    """,
                    user_id, body.library_id, body.work_slug, body.book_slug,
                    body.chapter, body.verse, body.translation,
                )
            if row is None:
                # Vanishingly unlikely (the conflicting row was deleted
                # between the two statements) — surface rather than crash
                # on dict(None).
                raise HTTPException(status_code=409, detail="bookmark conflict")
        return dict(row)

    @router.delete("/{bookmark_id}")
    async def delete_bookmark(
        bookmark_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE bookmark
                   SET deleted_at = $1, updated_at = $1
                 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
                RETURNING id
                """,
                now, bookmark_id, user_id,
            )
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return {"id": row["id"]}

    return router
