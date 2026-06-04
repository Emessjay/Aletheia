"""Study-group lifecycle: create, join by invite code, list mine, detail.

Tenancy here is by membership, not by ``user_id`` — a group is shared. A
non-member who asks for a group they're not in gets 404 (we don't leak the
existence of private groups), matching the no-leak posture of the
``/api/user/*`` routes.
"""
from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ...groups.moderation import can_rotate_invite_code
from ._common import get_role, new_id, new_invite_code, now_ms

_GROUP_COLS = "id, name, invite_code, created_by, created_at, deleted_at"


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class GroupJoin(BaseModel):
    invite_code: str = Field(min_length=6, max_length=32)


def groups_router() -> APIRouter:
    router = APIRouter()

    @router.post("/groups")
    async def create_group(
        body: GroupCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        gid = new_id()
        # Retry on the (astronomically rare) invite-code collision. Each
        # attempt is its own transaction so a UNIQUE violation rolls the
        # whole attempt back cleanly before we try a fresh code.
        for attempt in range(5):
            code = new_invite_code()
            try:
                async with pool.acquire() as conn:
                    async with conn.transaction():
                        row = await conn.fetchrow(
                            f"""
                            INSERT INTO study_group
                                (id, name, invite_code, created_by, created_at)
                            VALUES ($1, $2, $3, $4, $5)
                            RETURNING {_GROUP_COLS}
                            """,
                            gid, body.name, code, user_id, now,
                        )
                        await conn.execute(
                            """
                            INSERT INTO group_membership
                                (group_id, user_id, role, joined_at)
                            VALUES ($1, $2, 'owner', $3)
                            """,
                            gid, user_id, now,
                        )
                result = dict(row)
                result["role"] = "owner"
                return result
            except asyncpg.UniqueViolationError:
                if attempt == 4:
                    raise HTTPException(
                        status_code=500, detail="could not allocate invite code"
                    )
                continue

    @router.post("/groups/join")
    async def join_group(
        body: GroupJoin,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        now = now_ms()
        async with pool.acquire() as conn:
            group = await conn.fetchrow(
                f"""
                SELECT {_GROUP_COLS} FROM study_group
                 WHERE invite_code = $1 AND deleted_at IS NULL
                """,
                body.invite_code,
            )
            if group is None:
                raise HTTPException(status_code=404, detail="invalid invite code")
            # Idempotent join — re-joining keeps your existing role.
            await conn.execute(
                """
                INSERT INTO group_membership (group_id, user_id, role, joined_at)
                VALUES ($1, $2, 'member', $3)
                ON CONFLICT (group_id, user_id) DO NOTHING
                """,
                group["id"], user_id, now,
            )
            role = await get_role(conn, group["id"], user_id)
        result = dict(group)
        result["role"] = role.value if role else "member"
        return result

    @router.get("/groups")
    async def list_my_groups(
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT {", ".join("g." + c for c in _GROUP_COLS.split(", "))},
                       m.role
                  FROM study_group g
                  JOIN group_membership m ON m.group_id = g.id
                 WHERE m.user_id = $1 AND g.deleted_at IS NULL
                 ORDER BY g.created_at DESC
                """,
                user_id,
            )
        return [dict(r) for r in rows]

    @router.get("/groups/{group_id}")
    async def get_group(
        group_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            role = await get_role(conn, group_id, user_id)
            if role is None:
                # Not a member → 404 (don't reveal whether the group exists).
                raise HTTPException(status_code=404, detail="not found")
            group = await conn.fetchrow(
                f"""
                SELECT {_GROUP_COLS} FROM study_group
                 WHERE id = $1 AND deleted_at IS NULL
                """,
                group_id,
            )
            if group is None:
                raise HTTPException(status_code=404, detail="not found")
            member_count = await conn.fetchval(
                "SELECT COUNT(*) FROM group_membership WHERE group_id = $1",
                group_id,
            )
        result = dict(group)
        result["role"] = role.value
        result["member_count"] = member_count
        return result

    @router.post("/groups/{group_id}/rotate-code")
    async def rotate_invite_code(
        group_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        """Mint a fresh invite code, invalidating the old one.

        The recovery path for a leaked code: joins are by code alone, so
        rotation is the only way to cut off uninvited future joins (existing
        members are unaffected). Moderator/owner-only — see
        ``can_rotate_invite_code`` for why plain members are excluded.
        """
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            role = await get_role(conn, group_id, user_id)
            if role is None:
                # Not a member → 404 (don't reveal whether the group exists).
                raise HTTPException(status_code=404, detail="not found")
            if not can_rotate_invite_code(role):
                raise HTTPException(
                    status_code=403,
                    detail="only an owner or moderator may rotate the invite code",
                )
            # Same collision posture as create_group: retry on the
            # astronomically rare UNIQUE violation with a fresh code.
            for attempt in range(5):
                code = new_invite_code()
                try:
                    row = await conn.fetchrow(
                        f"""
                        UPDATE study_group SET invite_code = $1
                         WHERE id = $2 AND deleted_at IS NULL
                        RETURNING {_GROUP_COLS}
                        """,
                        code, group_id,
                    )
                    break
                except asyncpg.UniqueViolationError:
                    if attempt == 4:
                        raise HTTPException(
                            status_code=500, detail="could not allocate invite code"
                        )
                    continue
            if row is None:
                # Membership row outlived a soft-deleted group; treat as gone.
                raise HTTPException(status_code=404, detail="not found")
        result = dict(row)
        result["role"] = role.value
        return result

    return router
