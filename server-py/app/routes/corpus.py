"""/api/corpus/{select,selectOne} — mirrors server/src/routes/corpus.ts.

POST (not GET) because SQL strings can exceed URL length limits and may
contain characters that would need escaping.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..corpus import CorpusHandle, QueryError


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
    async def select(req: Request) -> JSONResponse:
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
        corpus: CorpusHandle = req.app.state.corpus
        try:
            rows = corpus.select(sql, params)
            return JSONResponse({"rows": rows})
        except QueryError as err:
            return _err(str(err), err.status)
        except Exception as err:  # noqa: BLE001
            return _err(str(err), 400)

    @router.post("/selectOne")
    async def select_one(req: Request) -> JSONResponse:
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
        corpus: CorpusHandle = req.app.state.corpus
        try:
            row = corpus.select_one(sql, params)
            return JSONResponse({"row": row})
        except QueryError as err:
            return _err(str(err), err.status)
        except Exception as err:  # noqa: BLE001
            return _err(str(err), 400)

    return router
