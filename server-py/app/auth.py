"""Supabase JWT verification for /api/user/* routes.

Supabase signs user JWTs with HS256 using the project's JWT secret (Settings →
API → JWT Settings → JWT Secret in the dashboard). The frontend will obtain a
token via supabase-js and send it as `Authorization: Bearer <jwt>` on every
user-data request. The backend verifies the signature against
`SUPABASE_JWT_SECRET`, checks the audience is `"authenticated"` (Supabase's
default for end-user tokens), and treats the `sub` claim as the user's UUID.

We deliberately do not call out to Supabase to fetch user records — the JWT
itself is the trust boundary, and `sub` is the only identity we need for
scoping user_data rows.
"""
from __future__ import annotations

import os
from typing import Optional
from uuid import UUID

from fastapi import Header, HTTPException, Request, status
from jose import JWTError, jwt


SUPABASE_AUDIENCE = "authenticated"
JWT_ALGORITHM = "HS256"


def resolve_jwt_secret() -> Optional[str]:
    """Read the configured signing secret, or None if unconfigured."""
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    return secret or None


def get_current_user_id(
    request: Request,
    authorization: str = Header(default=""),
) -> UUID:
    """FastAPI dependency: verify the bearer JWT and return the user UUID.

    - 503 if SUPABASE_JWT_SECRET is unset at request time (the app boots even
      without auth configured, matching the phase-2 pattern for DATABASE_URL,
      so local-dev convenience and the corpus endpoints aren't blocked).
    - 401 for any header / signature / audience / expiry failure. The error
      messages are intentionally non-leaky ("invalid token").
    """
    secret = getattr(request.app.state, "jwt_secret", None) or resolve_jwt_secret()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="auth not configured",
        )

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing authorization header",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid authorization header",
        )

    try:
        claims = jwt.decode(
            token,
            secret,
            algorithms=[JWT_ALGORITHM],
            audience=SUPABASE_AUDIENCE,
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        )

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        )

    try:
        return UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        )
