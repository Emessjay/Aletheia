"""/api/groups/* and /api/posts/* — multi-user study-group endpoints.

The web build's first surface where users interact with each other's content.
Unlike ``/api/user/*`` (rows private to one ``user_id``), these rows are shared
within a group; tenancy is by membership and the access rules live in
``app.groups.moderation``. Mounted at ``/api`` so it owns both the
group-scoped paths (``/groups/...``) and the post-scoped ones (``/posts/...``).
"""
from fastapi import APIRouter

from .digest import digest_router
from .groups import groups_router
from .posts import posts_router


def group_router() -> APIRouter:
    router = APIRouter()
    router.include_router(groups_router())
    router.include_router(posts_router())
    router.include_router(digest_router())
    return router
