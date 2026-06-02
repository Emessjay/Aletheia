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

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import new_id, now_ms


class BugReportCreate(BaseModel):
    id: str | None = None
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
            row = await conn.fetchrow(
                f"""
                INSERT INTO bug_report (id, user_id, platform, description,
                                        created_at)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING {_SELECT_COLS}
                """,
                row_id, user_id, body.platform, body.description, now,
            )
        return dict(row)

    return router
