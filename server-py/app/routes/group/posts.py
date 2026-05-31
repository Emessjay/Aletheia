"""Verse-anchored posts: create/reply, the per-verse feed, single thread,
author self-delete, flag, and moderator remove/restore.

Every state-changing call routes its decision through
``app.groups.moderation`` — the pure authority matrix + lifecycle state
machine — and never re-implements those rules inline. The DB enforces the
two things the state machine can't: one standing flag per user
(``UNIQUE(post_id, flagged_by)``) and referential integrity.
"""
from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ...auth import get_current_user_id
from ...db import get_pool
from ...groups.moderation import (
    ModerationAction,
    ModerationError,
    PostStatus,
    can_create_post,
    can_delete_own_post,
    can_reply,
    can_view_post,
    transition,
    visible_statuses_for,
)
from ._common import get_role, http_status_for, new_id, now_ms

_POST_COLS = (
    "id, group_id, parent_id, author_id, work_slug, book_slug, chapter, "
    "verse, translation, body, status, moderated_by, moderated_at, "
    "created_at, updated_at, deleted_at"
)
# A correlated count of live replies — useful in the feed and the digest.
_REPLY_COUNT = (
    "(SELECT COUNT(*) FROM group_post r "
    " WHERE r.parent_id = p.id AND r.deleted_at IS NULL "
    "   AND r.status <> 'removed') AS reply_count"
)


class PostCreate(BaseModel):
    id: Optional[str] = None
    parent_id: Optional[str] = None
    work_slug: str = Field(min_length=1)
    book_slug: str = Field(min_length=1)
    chapter: int
    verse: int
    translation: Optional[str] = None
    body: str = Field(min_length=1, max_length=4000)


class FlagCreate(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


class ModerateAction(BaseModel):
    action: Literal["remove", "restore"]


def _status_param(role, viewer_id) -> tuple[list[str], UUID]:
    """The status list a viewer may see, as text[] for ``status = ANY($n)``."""
    return [s.value for s in visible_statuses_for(role)], viewer_id


def posts_router() -> APIRouter:
    router = APIRouter()

    @router.post("/groups/{group_id}/posts")
    async def create_post(
        group_id: str,
        body: PostCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            role = await get_role(conn, group_id, user_id)
            if not can_create_post(role):
                raise HTTPException(
                    status_code=403, detail="you are not a member of this group"
                )

            work_slug, book_slug = body.work_slug, body.book_slug
            chapter, verse, translation = body.chapter, body.verse, body.translation
            parent_id = body.parent_id
            if parent_id is not None:
                parent = await conn.fetchrow(
                    f"SELECT {_POST_COLS} FROM group_post "
                    "WHERE id = $1 AND deleted_at IS NULL",
                    parent_id,
                )
                if parent is None or parent["group_id"] != group_id:
                    raise HTTPException(status_code=404, detail="parent post not found")
                if not can_reply(role, PostStatus(parent["status"])):
                    raise HTTPException(
                        status_code=409, detail="cannot reply to a removed post"
                    )
                # A reply inherits its parent's verse anchor so the thread stays
                # coherent — the client's anchor fields are ignored for replies.
                work_slug, book_slug = parent["work_slug"], parent["book_slug"]
                chapter, verse = parent["chapter"], parent["verse"]
                translation = parent["translation"]

            now = now_ms()
            pid = body.id or new_id()
            row = await conn.fetchrow(
                f"""
                INSERT INTO group_post
                    (id, group_id, parent_id, author_id, work_slug, book_slug,
                     chapter, verse, translation, body, status,
                     created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'visible', $11, $11)
                RETURNING {_POST_COLS}
                """,
                pid, group_id, parent_id, user_id, work_slug, book_slug,
                chapter, verse, translation, body.body, now,
            )
        return dict(row)

    @router.get("/groups/{group_id}/feed")
    async def list_feed(
        group_id: str,
        request: Request,
        work_slug: str = Query(...),
        book_slug: str = Query(...),
        chapter: int = Query(...),
        verse: Optional[int] = Query(default=None),
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            role = await get_role(conn, group_id, user_id)
            if role is None:
                raise HTTPException(status_code=404, detail="not found")
            statuses, viewer = _status_param(role, user_id)
            verse_clause = "AND p.verse = $7" if verse is not None else ""
            params = [
                group_id, work_slug, book_slug, chapter, statuses, viewer,
            ]
            if verse is not None:
                params.append(verse)
            rows = await conn.fetch(
                f"""
                SELECT {", ".join("p." + c for c in _POST_COLS.split(", "))},
                       {_REPLY_COUNT}
                  FROM group_post p
                 WHERE p.group_id = $1
                   AND p.parent_id IS NULL
                   AND p.work_slug = $2 AND p.book_slug = $3 AND p.chapter = $4
                   {verse_clause}
                   AND p.deleted_at IS NULL
                   AND (p.status = ANY($5::text[])
                        OR (p.status = 'removed' AND p.author_id = $6))
                 ORDER BY p.created_at DESC
                """,
                *params,
            )
        return [dict(r) for r in rows]

    @router.get("/posts/{post_id}")
    async def get_post(
        post_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            post = await conn.fetchrow(
                f"SELECT {_POST_COLS} FROM group_post "
                "WHERE id = $1 AND deleted_at IS NULL",
                post_id,
            )
            if post is None:
                raise HTTPException(status_code=404, detail="not found")
            role = await get_role(conn, post["group_id"], user_id)
            is_author = post["author_id"] == user_id
            if not can_view_post(role, PostStatus(post["status"]), is_author):
                raise HTTPException(status_code=404, detail="not found")
            statuses, viewer = _status_param(role, user_id)
            replies = await conn.fetch(
                f"""
                SELECT {", ".join("p." + c for c in _POST_COLS.split(", "))}
                  FROM group_post p
                 WHERE p.parent_id = $1
                   AND p.deleted_at IS NULL
                   AND (p.status = ANY($2::text[])
                        OR (p.status = 'removed' AND p.author_id = $3))
                 ORDER BY p.created_at ASC
                """,
                post_id, statuses, viewer,
            )
        return {"post": dict(post), "replies": [dict(r) for r in replies]}

    @router.delete("/posts/{post_id}")
    async def delete_own_post(
        post_id: str,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            post = await conn.fetchrow(
                "SELECT group_id, author_id FROM group_post "
                "WHERE id = $1 AND deleted_at IS NULL",
                post_id,
            )
            if post is None:
                raise HTTPException(status_code=404, detail="not found")
            role = await get_role(conn, post["group_id"], user_id)
            if not can_delete_own_post(role, post["author_id"] == user_id):
                # Either not a member, or not the author. Don't distinguish.
                raise HTTPException(status_code=403, detail="not your post")
            now = now_ms()
            await conn.execute(
                "UPDATE group_post SET deleted_at = $1, updated_at = $1 WHERE id = $2",
                now, post_id,
            )
        return {"id": post_id}

    @router.post("/posts/{post_id}/flag")
    async def flag_post(
        post_id: str,
        body: FlagCreate,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            async with conn.transaction():
                post = await conn.fetchrow(
                    f"SELECT {_POST_COLS} FROM group_post "
                    "WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                    post_id,
                )
                if post is None:
                    raise HTTPException(status_code=404, detail="not found")
                role = await get_role(conn, post["group_id"], user_id)
                is_author = post["author_id"] == user_id
                try:
                    new_status = transition(
                        PostStatus(post["status"]),
                        ModerationAction.FLAG,
                        role,
                        is_author,
                    )
                except ModerationError as err:
                    raise HTTPException(
                        status_code=http_status_for(err.reason), detail=str(err)
                    )
                # Record this user's standing flag (idempotent), then move the
                # status. The UNIQUE(post_id, flagged_by) constraint is what
                # makes a second flag a no-op rather than a duplicate row.
                await conn.execute(
                    """
                    INSERT INTO post_flag (id, post_id, flagged_by, reason, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (post_id, flagged_by) DO NOTHING
                    """,
                    new_id(), post_id, user_id, body.reason, now_ms(),
                )
                row = await conn.fetchrow(
                    f"UPDATE group_post SET status = $1, updated_at = $2 "
                    f"WHERE id = $3 RETURNING {_POST_COLS}",
                    new_status.value, now_ms(), post_id,
                )
        return dict(row)

    @router.post("/posts/{post_id}/moderate")
    async def moderate_post(
        post_id: str,
        body: ModerateAction,
        request: Request,
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        async with pool.acquire() as conn:
            async with conn.transaction():
                post = await conn.fetchrow(
                    f"SELECT {_POST_COLS} FROM group_post "
                    "WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
                    post_id,
                )
                if post is None:
                    raise HTTPException(status_code=404, detail="not found")
                role = await get_role(conn, post["group_id"], user_id)
                is_author = post["author_id"] == user_id
                try:
                    new_status = transition(
                        PostStatus(post["status"]),
                        ModerationAction(body.action),
                        role,
                        is_author,
                    )
                except ModerationError as err:
                    raise HTTPException(
                        status_code=http_status_for(err.reason), detail=str(err)
                    )
                now = now_ms()
                row = await conn.fetchrow(
                    f"""
                    UPDATE group_post
                       SET status = $1, moderated_by = $2, moderated_at = $3,
                           updated_at = $3
                     WHERE id = $4
                    RETURNING {_POST_COLS}
                    """,
                    new_status.value, user_id, now, post_id,
                )
        return dict(row)

    return router
