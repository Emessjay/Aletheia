"""The non-trivial cross-cutting query: most-discussed passages in a group.

This is the piece the README points at as the designed-not-CRUD logic. Given a
group and a trailing time window, it rolls every post and reply up by its verse
anchor and ranks the passages by how much real discussion they drew. The design
decisions that make it more than a SELECT:

  - **Window.** Only posts from the last ``days`` count, so "most discussed"
    means *recently*, not all-time — the value decays.
  - **What counts.** Removed and author-deleted posts are excluded from the
    rollup entirely; a passage shouldn't climb the board on content a moderator
    took down.
  - **Threshold.** A passage needs at least ``min_posts`` posts to appear — one
    lone comment is not a discussion, and without this the board is just "every
    verse anyone touched."
  - **Ranking + tiebreak.** Order by post volume, then by breadth of
    participation (distinct authors), then by recency. Volume is the headline
    signal; ties on volume go to the passage more people engaged with, and
    remaining ties to whatever's freshest.

The counts span top-level threads and their replies together (``parent_id`` is
not filtered), because a verse with one post and twenty replies is more
discussed than one with three posts and no replies.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ...auth import get_current_user_id
from ...db import get_pool
from ._common import get_role, now_ms

_DAY_MS = 24 * 60 * 60 * 1000


def digest_router() -> APIRouter:
    router = APIRouter()

    @router.get("/groups/{group_id}/discussed")
    async def most_discussed(
        group_id: str,
        request: Request,
        days: int = Query(default=7, ge=1, le=365),
        min_posts: int = Query(default=2, ge=1, le=100),
        limit: int = Query(default=10, ge=1, le=50),
        user_id: UUID = Depends(get_current_user_id),
    ):
        pool = await get_pool(request.app.state)
        since = now_ms() - days * _DAY_MS
        async with pool.acquire() as conn:
            role = await get_role(conn, group_id, user_id)
            if role is None:
                raise HTTPException(status_code=404, detail="not found")
            rows = await conn.fetch(
                """
                SELECT work_slug, book_slug, chapter, verse,
                       COUNT(*)                                  AS post_count,
                       COUNT(*) FILTER (WHERE parent_id IS NULL) AS thread_count,
                       COUNT(DISTINCT author_id)                 AS participant_count,
                       MAX(created_at)                           AS last_activity
                  FROM group_post
                 WHERE group_id = $1
                   AND deleted_at IS NULL
                   AND status <> 'removed'
                   AND created_at >= $2
                 GROUP BY work_slug, book_slug, chapter, verse
                HAVING COUNT(*) >= $3
                 ORDER BY post_count DESC, participant_count DESC, last_activity DESC
                 LIMIT $4
                """,
                group_id, since, min_posts, limit,
            )
        return [dict(r) for r in rows]

    return router
