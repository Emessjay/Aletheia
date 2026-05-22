"""Aletheia FastAPI app — phase 2 of the web-stack rewrite.

Phase 1 served the corpus from bundled SQLite. Phase 2 moves the corpus to
Postgres via asyncpg, leaving the {sql, params} HTTP contract intact —
SQLite FTS5 idioms in incoming SQL are rewritten to Postgres tsvector
equivalents in app/db.py. The Tauri desktop build still uses SQLite locally
and is unaffected.

Boot order:
  1. open the asyncpg pool against DATABASE_URL (fail fast if unset or
     unreachable — Railway healthcheck depends on the app booting cleanly),
  2. mount /api/health, /api/corpus, /api/audio,
  3. mount static-file serving + SPA fallback LAST so /api/* takes precedence.
"""

from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import resolve_audio_cache, resolve_static_dir
from .db import create_pool, resolve_database_url
from .routes.audio import audio_router
from .routes.corpus import corpus_router
from .static import mount_static

log = logging.getLogger("aletheia")


def _redact(url: str) -> str:
    return re.sub(r"://([^:/@]+):[^@]*@", r"://\1:****@", url)


@asynccontextmanager
async def lifespan(app: FastAPI):
    database_url = resolve_database_url()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not set. The phase-2 server reads the corpus "
            "from Postgres; set DATABASE_URL to a reachable database URL."
        )
    log.info("database: %s", _redact(database_url))
    log.info("audio cache: %s", resolve_audio_cache())
    log.info("static dir: %s", app.state.static_dir)
    app.state.pool = await create_pool(database_url)
    try:
        yield
    finally:
        pool = app.state.pool
        if pool is not None:
            await pool.close()


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    static_dir = resolve_static_dir()
    app.state.static_dir = static_dir
    app.state.pool = None  # populated by lifespan, or lazily by get_pool()
    app.state._pool_lock = None  # asyncio.Lock created lazily (needs running loop)

    @app.get("/api/health")
    async def health() -> JSONResponse:
        return JSONResponse({"ok": True, "corpus": "loaded"})

    app.include_router(corpus_router(), prefix="/api/corpus")
    app.include_router(audio_router(), prefix="/api/audio")

    # Mount the SPA catch-all LAST. The handler itself returns JSON 404 for
    # any unmatched /api/* path so the SPA fallback never swallows API calls.
    mount_static(app, static_dir)

    return app


app = create_app()
