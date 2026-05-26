"""Test-only helpers for crafting JWTs and authenticated httpx clients."""
import os
from typing import Any

from httpx import AsyncClient, ASGITransport
from jose import jwt

ALICE_ID = "00000000-0000-0000-0000-000000000a11"
BOB_ID = "00000000-0000-0000-0000-000000000b0b"


def make_jwt(user_id: str, *, secret: str | None = None, aud: str = "authenticated", exp_offset: int = 3600) -> str:
    import time

    secret = secret or os.environ["SUPABASE_JWT_SECRET"]
    payload: dict[str, Any] = {
        "sub": user_id,
        "aud": aud,
        "iat": int(time.time()),
        "exp": int(time.time()) + exp_offset,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def auth_client(app, user_id: str):
    """Return an AsyncClient context with the Authorization header preset."""
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {make_jwt(user_id)}"},
    )


def unauth_client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
