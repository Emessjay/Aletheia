"""Env-var resolution. Mirrors server/src/index.ts."""

from __future__ import annotations

import os
from pathlib import Path


def resolve_audio_cache() -> Path:
    """Resolved at request time so tests can override via monkeypatch."""
    env = os.environ.get("ALETHEIA_AUDIO_CACHE")
    return Path(env).resolve() if env else Path("/tmp/aletheia-audio").resolve()


def resolve_static_dir() -> Path:
    env = os.environ.get("ALETHEIA_STATIC_DIR")
    if env:
        return Path(env).resolve()
    # In the Docker image, the app lives at /app and the frontend lands at
    # /app/public. In local dev, dist/ sits at the repo root, two levels up
    # from server-py/app/.
    docker = (Path(__file__).resolve().parent.parent / "public").resolve()
    if (docker / "index.html").exists():
        return docker
    return (Path(__file__).resolve().parents[2] / "dist").resolve()
