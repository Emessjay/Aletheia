"""Aletheia FastAPI app — phase 1 of the web-stack rewrite.

Replaces the previous Node server (deleted from this commit). Phase 2 moves
the corpus to Postgres; phase 3 adds Supabase Auth and user-data sync.

Boot order mirrors the Node version:
  1. open the corpus DB read-only (fail fast if missing — Railway healthcheck
     won't pass without it),
  2. mount /api/health, /api/corpus, /api/audio,
  3. mount static-file serving + SPA fallback LAST so /api/* takes precedence
     over any same-named asset.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .config import resolve_audio_cache, resolve_corpus_path, resolve_static_dir
from .corpus import open_corpus
from .routes.audio import audio_router
from .routes.corpus import corpus_router
from .static import mount_static

log = logging.getLogger("aletheia")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("corpus: %s", app.state.corpus_path)
    log.info("audio cache: %s", resolve_audio_cache())
    log.info("static dir: %s", app.state.static_dir)
    try:
        yield
    finally:
        try:
            app.state.corpus.close()
        except Exception:  # noqa: BLE001
            # Already closed or never opened; nothing actionable.
            pass


def create_app() -> FastAPI:
    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    corpus_path = resolve_corpus_path()
    static_dir = resolve_static_dir()

    app.state.corpus_path = corpus_path
    app.state.static_dir = static_dir
    app.state.corpus = open_corpus(corpus_path)

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
