"""Static-site host for the production-built React frontend.

Mirrors server/src/static.ts. The SPA fallback rewrites any non-/api 404 to
``index.html`` so React Router's client-side routes work on direct URL hits
(e.g. /reader/bible/john/1). Unknown ``/api/*`` paths return JSON 404 instead
of HTML — frontend reliability depends on that distinction.
"""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, FastAPI
from fastapi.responses import FileResponse, JSONResponse, Response


def mount_static(app: FastAPI, static_dir: Path) -> None:
    """Register the SPA catch-all on ``app``.

    Registered last so ``/api/*`` routes take precedence. The catch-all
    explicitly returns JSON 404 for any unmatched ``/api/*`` path — Starlette's
    path matching would otherwise route them here too.
    """

    router = APIRouter()
    index_path = static_dir / "index.html"

    @router.get("/{full_path:path}")
    async def spa(full_path: str) -> Response:
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse({"error": "Not Found"}, status_code=404)

        if not index_path.exists():
            # Frontend not built yet — surface a JSON 404 with a hint instead
            # of a 5xx so the route stays usable during API-only local dev.
            return JSONResponse(
                {
                    "error": "frontend not built",
                    "hint": f"index.html missing at {index_path}; run `npm run build`",
                },
                status_code=404,
            )

        if full_path:
            candidate = (static_dir / full_path).resolve()
            try:
                candidate.relative_to(static_dir.resolve())
            except ValueError:
                # Path traversal attempt — fall through to index for SPA.
                return FileResponse(index_path, media_type="text/html")
            if candidate.is_file():
                mt, _ = mimetypes.guess_type(str(candidate))
                return FileResponse(candidate, media_type=mt or "application/octet-stream")

        return FileResponse(index_path, media_type="text/html")

    app.include_router(router)
