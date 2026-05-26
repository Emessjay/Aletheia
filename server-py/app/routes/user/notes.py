"""Note CRUD scoped by user_id. Body is plain markdown text."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import new_id, now_ms


_SELECT_COLS = (
    "id, user_id, work_slug, book_slug, chapter, verse, body, "
    "created_at, updated_at, deleted_at"
)


class NoteCreate(BaseModel):
    id: Optional[str] = None
    work_slug: str = Field(min_length=1)
    book_slug: str = Field(min_length=1)
    chapter: int
    verse: int
    body: str


class NoteUpdate(BaseModel):
    body: str


def notes_router() -> APIRouter:
    router = APIRouter()

    @router.get("/verse")
    async def list_verse_notes(
        request: Request,
        work_slug: str = Query(...),
        book_slug: str = Query(...),
        chapter: int = Query(...),
        verse: int = Query(...),
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT {_SELECT_COLS}
                  FROM note
                 WHERE user_id = $1
                   AND work_slug = $2 AND book_slug = $3
                   AND chapter = $4 AND verse = $5
                   AND deleted_at IS NULL
                 ORDER BY created_at
                """,
                user_id, work_slug, book_slug, chapter, verse,
            )
        return [dict(r) for r in rows]

    @router.post("")
    async def create_note(
        body: NoteCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        row_id = body.id or new_id()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                INSERT INTO note (id, user_id, work_slug, book_slug,
                                  chapter, verse, body,
                                  created_at, updated_at, deleted_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NULL)
                RETURNING {_SELECT_COLS}
                """,
                row_id, user_id, body.work_slug, body.book_slug,
                body.chapter, body.verse, body.body, now,
            )
        return dict(row)

    @router.patch("/{note_id}")
    async def update_note(
        note_id: str,
        body: NoteUpdate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"""
                UPDATE note
                   SET body = $1, updated_at = $2
                 WHERE id = $3 AND user_id = $4 AND deleted_at IS NULL
                RETURNING {_SELECT_COLS}
                """,
                body.body, now, note_id, user_id,
            )
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return dict(row)

    @router.delete("/{note_id}")
    async def delete_note(
        note_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE note
                   SET deleted_at = $1, updated_at = $1
                 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
                RETURNING id
                """,
                now, note_id, user_id,
            )
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return {"id": row["id"]}

    return router
