"""Shared helpers for user-data routes.

The :func:`new_id` factory generates a server-side identifier when the client
didn't supply one. Phase 3b will pass ULIDs from the frontend (matching the
Tauri side); for 3a we accept any TEXT id and generate a UUID-encoded TEXT
when missing.
"""

from __future__ import annotations

import time
from uuid import uuid4


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id() -> str:
    # Server-side fallback. Phase 3b will pass client-generated ULIDs to
    # match the Tauri side; the column stays TEXT either way.
    return uuid4().hex
