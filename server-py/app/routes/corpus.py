"""/api/corpus/{select,selectOne} — Postgres backend (phase 2).

The request/response shape is unchanged from phase 1: clients post
``{sql, params}`` and get back ``{rows}`` or ``{row}``. FTS5 idioms
(``verse_fts MATCH``, ``snippet(...)``, ``ORDER BY rank``) in the incoming
SQL are translated to Postgres tsvector equivalents by ``app.db.rewrite_fts``
before execution.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..db import QueryError, get_pool, select, select_one


def _normalize_params(raw: Any) -> list[Any]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise QueryError("params must be an array", 400)
    return raw


def _err(message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


def corpus_router() -> APIRouter:
    router = APIRouter()

    @router.post("/select")
    async def select_endpoint(req: Request) -> JSONResponse:
        try:
            body = await req.json()
        except Exception:
            return _err("invalid JSON body")
        if not isinstance(body, dict):
            return _err("body must be a JSON object")
        sql = body.get("sql")
        if not isinstance(sql, str):
            return _err("sql must be a string")
        try:
            params = _normalize_params(body.get("params"))
        except QueryError as err:
            return _err(str(err), err.status)
        pool = await get_pool(req.app.state)
        try:
            rows = await select(pool, sql, params)
            return JSONResponse({"rows": rows})
        except QueryError as err:
            return _err(str(err), err.status)
        except Exception as err:  # noqa: BLE001
            return _err(str(err), 400)

    @router.post("/selectOne")
    async def select_one_endpoint(req: Request) -> JSONResponse:
        try:
            body = await req.json()
        except Exception:
            return _err("invalid JSON body")
        if not isinstance(body, dict):
            return _err("body must be a JSON object")
        sql = body.get("sql")
        if not isinstance(sql, str):
            return _err("sql must be a string")
        try:
            params = _normalize_params(body.get("params"))
        except QueryError as err:
            return _err(str(err), err.status)
        pool = await get_pool(req.app.state)
        try:
            row = await select_one(pool, sql, params)
            return JSONResponse({"row": row})
        except QueryError as err:
            return _err(str(err), err.status)
        except Exception as err:  # noqa: BLE001
            return _err(str(err), 400)

    return router
