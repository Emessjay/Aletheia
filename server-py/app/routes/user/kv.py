"""Per-user key/value store (preferences, last-viewed chapter, etc.).

Primary key is composite ``(user_id, key)`` — ``key`` is not globally unique
once it's user-scoped (every user's ``theme`` row coexists).
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import now_ms


class KVPut(BaseModel):
    value: str


def kv_router() -> APIRouter:
    router = APIRouter()

    @router.get("/{key:path}")
    async def get_kv(
        key: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT value FROM kv WHERE user_id = $1 AND key = $2",
                user_id, key,
            )
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return {"value": row["value"]}

    @router.put("/{key:path}")
    async def put_kv(
        key: str,
        body: KVPut,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO kv (user_id, key, value, updated_at)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (user_id, key)
                DO UPDATE SET value = EXCLUDED.value,
                              updated_at = EXCLUDED.updated_at
                """,
                user_id, key, body.value, now,
            )
        return {"value": body.value}

    return router
