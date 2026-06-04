"""Bug-report submission — web-only, forward-only ticket log.

A single authenticated POST writes one row into `bug_report`. There is no
list / read / delete: v1 is file-and-forget, and admins triage via the
Supabase dashboard. The `platform` enum is constrained both here (Pydantic
Literal) and at the DB level (CHECK), so a future refactor that relaxes one
still can't write a freeform value.

Scoping invariant: the inserted `user_id` comes from the verified JWT `sub`
(via ``Depends(get_current_user_id)``), never from the request body.
"""
from __future__ import annotations

from typing import Literal
from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import new_id, now_ms

# Flood brake: open sign-up means any account can reach this endpoint, and
# unbounded inserts would chew through the shared free-tier disk. The brake
# is per-user-per-day; a count-then-insert race can let one report squeak
# over under concurrency, which is fine — it's a brake, not an invariant.
DAILY_LIMIT = 10
_DAY_MS = 24 * 60 * 60 * 1000


class BugReportCreate(BaseModel):
    # Client-generated ULID/UUID, or None for the server-side fallback.
    # Bounded and charset-checked: this value lands in a TEXT primary key,
    # so without the cap it would be a second, unlimited payload channel
    # outside the description's 10k limit.
    id: str | None = Field(
        default=None, max_length=40, pattern=r"^[A-Za-z0-9_-]+$"
    )
    platform: Literal["web", "local"]
    description: str = Field(min_length=1, max_length=10_000)


_SELECT_COLS = "id, user_id, platform, description, created_at"


def bug_reports_router() -> APIRouter:
    router = APIRouter()

    @router.post("")
    async def create_bug_report(
        body: BugReportCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        row_id = body.id or new_id()
        async with pool.acquire() as conn:
            recent = await conn.fetchval(
                "SELECT COUNT(*) FROM bug_report "
                "WHERE user_id = $1 AND created_at > $2",
                user_id, now - _DAY_MS,
            )
            if recent >= DAILY_LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail="daily bug-report limit reached; try again tomorrow",
                )
            try:
                row = await conn.fetchrow(
                    f"""
                    INSERT INTO bug_report (id, user_id, platform, description,
                                            created_at)
                    VALUES ($1, $2, $3, $4, $5)
                    RETURNING {_SELECT_COLS}
                    """,
                    row_id, user_id, body.platform, body.description, now,
                )
            except asyncpg.UniqueViolationError:
                # A colliding client-supplied id is the caller's error, not a
                # server fault — 409, not an unhandled 500.
                raise HTTPException(status_code=409, detail="duplicate id")
        return dict(row)

    return router
