"""/api/audio/* — mirrors server/src/routes/audio.ts.

Slug/filename validation mirrors src-tauri/src/audio.rs intentionally: the
values land inside filesystem paths, so anything looser would be a path-
traversal foot-gun. Keep these regexes in sync if the Rust side ever loosens
its rules.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from ..config import resolve_audio_cache

ALLOWED_TRANSLATIONS = {"en_bsb", "en_kjv", "en_web"}

SLUG_RE = re.compile(r"^[a-z0-9_]{1,32}$")
FILENAME_RE = re.compile(r"^[A-Za-z0-9._\-()]{1,128}\.mp3$")

# Match the existing Node value so upstream logs see the same identity.
USER_AGENT = "Aletheia/0.1 (https://github.com/Emessjay/aletheia)"

# Stream MP3s in 64 KiB chunks. Small enough to stay responsive on seek,
# large enough to keep syscall overhead off the hot path.
CHUNK_SIZE = 64 * 1024


def _err(message: str, status: int = 400) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


def _validate(translation: Any, book: Any, file: Any | None) -> tuple[str, str, str] | JSONResponse:
    if not isinstance(translation, str) or translation not in ALLOWED_TRANSLATIONS:
        return _err(f"unsupported translation: {translation}")
    if not isinstance(book, str) or not SLUG_RE.match(book):
        return _err(f"invalid book slug: {book}")
    if file is None:
        return translation, book, ""
    if not isinstance(file, str) or "/" in file or "\\" in file or ".." in file:
        return _err(f"invalid filename: {file}")
    if not FILENAME_RE.match(file):
        return _err(f"invalid filename: {file}")
    return translation, book, file


def _book_dir(cache_root: Path, translation: str, book: str) -> Path:
    return cache_root / translation / book


def _source_path(cache_root: Path, translation: str, book: str, file: str) -> Path:
    return _book_dir(cache_root, translation, book) / file


def _stream_url(translation: str, book: str, file: str) -> str:
    return f"/api/audio/stream/{translation}/{book}/{quote(file, safe='')}"


def _file_exists_nonempty(p: Path) -> bool:
    try:
        st = p.stat()
    except OSError:
        return False
    return st.st_size > 0 and p.is_file()


def audio_router() -> APIRouter:
    router = APIRouter()

    @router.get("/source-path")
    async def source_path(req: Request) -> Response:
        translation = req.query_params.get("translation")
        book = req.query_params.get("book")
        file = req.query_params.get("file")
        v = _validate(translation, book, file)
        if isinstance(v, JSONResponse):
            return v
        tr, bk, fl = v
        p = _source_path(resolve_audio_cache(), tr, bk, fl)
        return JSONResponse({"url": _stream_url(tr, bk, fl), "exists": _file_exists_nonempty(p)})

    @router.get("/book-sources")
    async def book_sources(req: Request) -> Response:
        translation = req.query_params.get("translation")
        book = req.query_params.get("book")
        v = _validate(translation, book, None)
        if isinstance(v, JSONResponse):
            return v
        tr, bk, _ = v
        dir_ = _book_dir(resolve_audio_cache(), tr, bk)
        if not dir_.exists():
            return JSONResponse([])
        try:
            names = sorted(
                p.name
                for p in dir_.iterdir()
                if p.name.endswith(".mp3") and _file_exists_nonempty(p)
            )
        except OSError as err:
            return _err(f"read_dir {dir_}: {err}", 500)
        return JSONResponse(names)

    @router.post("/download")
    async def download(req: Request) -> Response:
        try:
            body = await req.json()
        except Exception:
            return _err("invalid JSON body")
        if not isinstance(body, dict):
            return _err("body must be a JSON object")
        v = _validate(body.get("translation"), body.get("book"), body.get("filename"))
        if isinstance(v, JSONResponse):
            return v
        tr, bk, fl = v
        url = body.get("url")
        if not isinstance(url, str) or not re.match(r"^https?://", url, re.IGNORECASE):
            return _err(f"refusing non-http(s) URL: {url}")

        cache_root = resolve_audio_cache()
        dest = _source_path(cache_root, tr, bk, fl)
        dest.parent.mkdir(parents=True, exist_ok=True)

        # Short-circuit if already cached. The Tauri code re-downloads
        # unconditionally; here we don't, because Railway's ephemeral disk
        # means the cache *is* the source of truth between deploys.
        if _file_exists_nonempty(dest):
            return JSONResponse({"url": _stream_url(tr, bk, fl)})

        part = dest.with_suffix(dest.suffix + ".part")
        try:
            async with httpx.AsyncClient(
                follow_redirects=True,
                headers={"user-agent": USER_AGENT},
                timeout=httpx.Timeout(30.0, read=120.0),
            ) as client:
                async with client.stream("GET", url) as resp:
                    if resp.status_code >= 400:
                        return _err(f"GET {url} returned HTTP {resp.status_code}", 502)
                    with part.open("wb") as out:
                        async for chunk in resp.aiter_bytes(CHUNK_SIZE):
                            out.write(chunk)
            part.replace(dest)
            return JSONResponse({"url": _stream_url(tr, bk, fl)})
        except Exception as err:  # noqa: BLE001
            try:
                part.unlink()
            except OSError:
                pass
            return _err(f"download failed: {err}", 502)

    @router.get("/stream/{translation}/{book}/{file}")
    async def stream(translation: str, book: str, file: str, request: Request) -> Response:
        v = _validate(translation, book, file)
        if isinstance(v, JSONResponse):
            return v
        tr, bk, fl = v
        p = _source_path(resolve_audio_cache(), tr, bk, fl)
        try:
            st = p.stat()
        except OSError:
            return _err("not found", 404)
        if not p.is_file() or st.st_size == 0:
            return _err("not found", 404)
        return _stream_range(request, p, st.st_size)

    return router


# HTTP Range support. The browser <audio> tag fires a Range request whenever
# the user seeks, so without this every seek triggers a full re-download.
_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _stream_range(request: Request, file_path: Path, size: int) -> Response:
    range_header = request.headers.get("range")
    if not range_header:
        return _full_response(file_path, size)

    match = _RANGE_RE.match(range_header.strip())
    if not match:
        return Response(
            status_code=416,
            headers={"content-range": f"bytes */{size}", "accept-ranges": "bytes"},
        )
    start_raw, end_raw = match.group(1), match.group(2)
    if start_raw == "" and end_raw != "":
        # suffix-byte-range: last N bytes
        try:
            suffix = int(end_raw)
        except ValueError:
            return _range_not_satisfiable(size)
        if suffix <= 0:
            return _range_not_satisfiable(size)
        start = max(0, size - suffix)
        end = size - 1
    else:
        try:
            start = 0 if start_raw == "" else int(start_raw)
            end = size - 1 if end_raw == "" else int(end_raw)
        except ValueError:
            return _range_not_satisfiable(size)

    if start > end or start < 0 or end >= size:
        return _range_not_satisfiable(size)

    length = end - start + 1
    return StreamingResponse(
        _file_iter(file_path, start, length),
        status_code=206,
        media_type="audio/mpeg",
        headers={
            "accept-ranges": "bytes",
            "content-range": f"bytes {start}-{end}/{size}",
            "content-length": str(length),
        },
    )


def _range_not_satisfiable(size: int) -> Response:
    return Response(
        status_code=416,
        headers={"content-range": f"bytes */{size}", "accept-ranges": "bytes"},
    )


def _full_response(file_path: Path, size: int) -> StreamingResponse:
    return StreamingResponse(
        _file_iter(file_path, 0, size),
        status_code=200,
        media_type="audio/mpeg",
        headers={"accept-ranges": "bytes", "content-length": str(size)},
    )


def _file_iter(file_path: Path, start: int, length: int):
    def gen():
        remaining = length
        with file_path.open("rb") as f:
            f.seek(start)
            while remaining > 0:
                chunk = f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk
    return gen()
