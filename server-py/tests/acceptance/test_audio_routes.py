import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_source_path_rejects_unknown_translation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/audio/source-path",
            params={"translation": "xx", "book": "genesis", "file": "a.mp3"},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_source_path_rejects_path_traversal_filename():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/audio/source-path",
            params={"translation": "en_bsb", "book": "genesis", "file": "../etc.mp3"},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_source_path_rejects_non_mp3_extension():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/audio/source-path",
            params={"translation": "en_bsb", "book": "genesis", "file": "a.wav"},
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_source_path_returns_exists_false_for_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("ALETHEIA_AUDIO_CACHE", str(tmp_path))
    # Re-import is not required if your app reads env at request time. If
    # your app caches the path at import, document that and provide a
    # way to override it in tests (a fixture or app.state mutation).
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/audio/source-path",
            params={"translation": "en_bsb", "book": "genesis", "file": "missing.mp3"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["exists"] is False
    assert data["url"].startswith("/api/audio/stream/en_bsb/genesis/")


@pytest.mark.asyncio
async def test_book_sources_returns_empty_for_unknown_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("ALETHEIA_AUDIO_CACHE", str(tmp_path))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/audio/book-sources",
            params={"translation": "en_bsb", "book": "genesis"},
        )
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_download_rejects_non_http_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/audio/download",
            json={
                "translation": "en_bsb",
                "book": "genesis",
                "url": "ftp://example.com/a.mp3",
                "filename": "a.mp3",
            },
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_stream_returns_206_for_range_request(tmp_path, monkeypatch):
    # Seed a fake mp3 in the cache dir so the stream endpoint has something
    # to serve. The byte content doesn't need to be real audio for the Range
    # contract test.
    monkeypatch.setenv("ALETHEIA_AUDIO_CACHE", str(tmp_path))
    book_dir = tmp_path / "en_bsb" / "genesis"
    book_dir.mkdir(parents=True)
    sample = book_dir / "ch01.mp3"
    sample.write_bytes(b"x" * 1024)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/audio/stream/en_bsb/genesis/ch01.mp3",
            headers={"range": "bytes=0-99"},
        )
    assert resp.status_code == 206
    assert resp.headers["content-range"] == "bytes 0-99/1024"
    assert resp.headers["accept-ranges"] == "bytes"
    assert len(resp.content) == 100


@pytest.mark.asyncio
async def test_stream_returns_416_for_out_of_range(tmp_path, monkeypatch):
    monkeypatch.setenv("ALETHEIA_AUDIO_CACHE", str(tmp_path))
    book_dir = tmp_path / "en_bsb" / "genesis"
    book_dir.mkdir(parents=True)
    (book_dir / "ch01.mp3").write_bytes(b"x" * 100)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/audio/stream/en_bsb/genesis/ch01.mp3",
            headers={"range": "bytes=200-300"},
        )
    assert resp.status_code == 416


@pytest.mark.asyncio
async def test_stream_returns_404_for_missing_file(tmp_path, monkeypatch):
    monkeypatch.setenv("ALETHEIA_AUDIO_CACHE", str(tmp_path))
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/audio/stream/en_bsb/genesis/missing.mp3")
    assert resp.status_code == 404
