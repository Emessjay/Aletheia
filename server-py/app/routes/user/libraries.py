"""Library CRUD. Soft-delete via deleted_at."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import new_id, now_ms


class LibraryCreate(BaseModel):
    id: Optional[str] = None
    name: str = Field(min_length=1)
    sort_order: int = 0


def libraries_router() -> APIRouter:
    router = APIRouter()

    @router.get("")
    async def list_libraries(
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, user_id, name, sort_order,
                       created_at, updated_at, deleted_at
                  FROM library
                 WHERE user_id = $1 AND deleted_at IS NULL
                 ORDER BY sort_order, created_at
                """,
                user_id,
            )
        return [dict(r) for r in rows]

    @router.post("")
    async def create_library(
        body: LibraryCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        row_id = body.id or new_id()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO library (id, user_id, name, sort_order,
                                     created_at, updated_at, deleted_at)
                VALUES ($1, $2, $3, $4, $5, $5, NULL)
                RETURNING id, user_id, name, sort_order,
                          created_at, updated_at, deleted_at
                """,
                row_id, user_id, body.name, body.sort_order, now,
            )
        return dict(row)

    @router.delete("/{library_id}")
    async def delete_library(
        library_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE library
                   SET deleted_at = $1, updated_at = $1
                 WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL
                RETURNING id
                """,
                now, library_id, user_id,
            )
        if row is None:
            # Don't distinguish "doesn't exist" from "belongs to another user".
            raise HTTPException(status_code=404, detail="not found")
        return {"id": row["id"]}

    return router
