"""Per-user public profile — currently just a display name.

GET returns *my* profile (404 until one is set); PUT upserts it. Other
users' names are exposed only through the read-time join in
app/routes/group/posts.py — there is no endpoint to enumerate or look up
arbitrary profiles, so the table leaks nothing beyond what a group feed
already shows.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import now_ms


class ProfilePut(BaseModel):
    display_name: str = Field(min_length=1, max_length=50)


def profile_router() -> APIRouter:
    router = APIRouter()

    @router.get("")
    async def get_profile(
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT display_name FROM profile WHERE user_id = $1",
                user_id,
            )
        if row is None:
            raise HTTPException(status_code=404, detail="not found")
        return {"display_name": row["display_name"]}

    @router.put("")
    async def put_profile(
        body: ProfilePut,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        # Pydantic enforces 1..50 on the raw value; re-check after trimming
        # so "   " can't sneak past the min_length gate.
        name = body.display_name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="display_name is blank")
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO profile (user_id, display_name, created_at, updated_at)
                VALUES ($1, $2, $3, $3)
                ON CONFLICT (user_id)
                DO UPDATE SET display_name = EXCLUDED.display_name,
                              updated_at = EXCLUDED.updated_at
                """,
                user_id, name, now,
            )
        return {"display_name": name}

    return router
