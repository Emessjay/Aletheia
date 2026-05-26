"""/api/user/* — authenticated user-data endpoints.

**Scoping invariant.** Every SQL statement issued by this package binds the
authenticated user_id as a parameter and constrains the row to
``WHERE user_id = $1`` (or ``user_id = $N`` for inserts / upserts). There is
no code path that runs an unscoped UPDATE / DELETE / SELECT against the
user-data tables. Cross-user reads return an empty list; cross-user mutations
return 404 (not 403 — we don't leak the existence of another user's rows).

The contract here is consumed by the React frontend in phase 3b. The Tauri
desktop build talks to local SQLite via plugin-sql and never hits these
routes.
"""

from fastapi import APIRouter

from .libraries import libraries_router
from .highlights import highlights_router
from .notes import notes_router
from .bookmarks import bookmarks_router
from .annotations import annotations_router
from .kv import kv_router


def user_router() -> APIRouter:
    router = APIRouter()
    router.include_router(libraries_router(), prefix="/libraries")
    router.include_router(highlights_router(), prefix="/highlights")
    router.include_router(notes_router(), prefix="/notes")
    router.include_router(bookmarks_router(), prefix="/bookmarks")
    router.include_router(annotations_router(), prefix="/annotations")
    router.include_router(kv_router(), prefix="/kv")
    return router
