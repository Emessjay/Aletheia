"""Supabase JWT verification for /api/user/* routes.

Supabase has two JWT signing schemes, and this module accepts both, selected
by the token's own header:

- **ES256 (current projects).** Supabase signs end-user tokens with a
  project-specific elliptic-curve key and publishes the *public* half at
  ``{SUPABASE_URL}/auth/v1/.well-known/jwks.json``. We fetch that JWKS once
  at startup (and lazily retry on demand), cache it on ``app.state.jwks``,
  and verify ES256 tokens against the key whose ``kid`` matches. This is
  what production uses — the deployed project signs with ES256, which an
  HS256-only verifier rejects as "invalid token" even though the token is
  genuine (the bug that motivated this design).
- **HS256 (legacy shared secret).** Verified against ``SUPABASE_JWT_SECRET``
  (Settings → API → JWT Settings in the dashboard). Kept because legacy
  Supabase projects still sign this way and the test suite mints HS256
  tokens with a throwaway secret.

Each path pins exactly one algorithm — a token claiming HS256 is never
checked against the EC key and vice versa, so there's no algorithm-confusion
surface. In both cases we require ``aud == "authenticated"`` (Supabase's
end-user audience) and treat the ``sub`` claim as the user's UUID.

We deliberately do not call out to Supabase to fetch user records — the JWT
itself is the trust boundary, and ``sub`` is the only identity we need for
scoping user_data rows.
"""
from __future__ import annotations

import os
from typing import Any, Optional
from uuid import UUID

import httpx
from fastapi import Header, HTTPException, Request, status
from jose import JWTError, jwt


SUPABASE_AUDIENCE = "authenticated"
LEGACY_ALGORITHM = "HS256"
JWKS_ALGORITHM = "ES256"
JWKS_FETCH_TIMEOUT = 5.0


def resolve_jwt_secret() -> Optional[str]:
    """Read the configured legacy signing secret, or None if unconfigured."""
    secret = os.environ.get("SUPABASE_JWT_SECRET")
    return secret or None


def resolve_supabase_url() -> Optional[str]:
    """The Supabase project base URL, used to locate the JWKS endpoint.

    ``SUPABASE_URL`` wins if set; otherwise fall back to
    ``VITE_SUPABASE_URL``, which the Railway service already defines for the
    frontend build — at runtime the same variable is present in the server's
    environment, so production needs no additional configuration.
    """
    url = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
    return url.rstrip("/") if url else None


def fetch_jwks() -> Optional[dict]:
    """Fetch the project's public signing keys. None on any failure.

    Blocking call (httpx sync) — invoked from the lifespan at boot, and from
    the request path only as a lazy retry when an ES256 token arrives before
    a successful fetch has been cached. Failures are non-fatal by design:
    a corpus-only deployment with no Supabase URL still boots and serves.
    """
    base = resolve_supabase_url()
    if not base:
        return None
    try:
        resp = httpx.get(
            f"{base}/auth/v1/.well-known/jwks.json", timeout=JWKS_FETCH_TIMEOUT
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None
    keys = data.get("keys") if isinstance(data, dict) else None
    if not isinstance(keys, list) or not keys:
        return None
    return data


def _select_jwk(jwks: dict, kid: Optional[str]) -> Optional[dict]:
    """Pick the JWK matching the token's ``kid``.

    A token without a ``kid`` is accepted only when the set has exactly one
    key (nothing to disambiguate); otherwise the match must be exact.
    """
    keys = jwks.get("keys", [])
    if kid is None:
        return keys[0] if len(keys) == 1 else None
    for key in keys:
        if key.get("kid") == kid:
            return key
    return None


def _unauthorized(detail: str = "invalid token") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def get_current_user_id(
    request: Request,
    authorization: str = Header(default=""),
) -> UUID:
    """FastAPI dependency: verify the bearer JWT and return the user UUID.

    - 503 if no verification material exists for the token's algorithm
      (neither the legacy secret nor a reachable JWKS, depending on path).
      The app boots even without auth configured, matching the phase-2
      pattern for DATABASE_URL, so local-dev convenience and the corpus
      endpoints aren't blocked.
    - 401 for any header / signature / audience / expiry failure. The error
      messages are intentionally non-leaky ("invalid token").
    """
    state = request.app.state
    secret = getattr(state, "jwt_secret", None) or resolve_jwt_secret()
    jwks = getattr(state, "jwks", None)
    if not secret and jwks is None and not resolve_supabase_url():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="auth not configured",
        )

    if not authorization:
        raise _unauthorized("missing authorization header")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized("invalid authorization header")

    try:
        header = jwt.get_unverified_header(token)
    except JWTError:
        raise _unauthorized()

    alg = header.get("alg")
    if alg == JWKS_ALGORITHM:
        if jwks is None:
            # Lazy retry: boot-time fetch failed or hadn't happened (tests
            # via ASGITransport never run the lifespan). Cache on success;
            # on failure leave None so the next request retries.
            jwks = fetch_jwks()
            if jwks is not None:
                state.jwks = jwks
        if jwks is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="auth not configured",
            )
        key: Any = _select_jwk(jwks, header.get("kid"))
        if key is None:
            raise _unauthorized()
        algorithms = [JWKS_ALGORITHM]
    elif alg == LEGACY_ALGORITHM:
        if not secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="auth not configured",
            )
        key = secret
        algorithms = [LEGACY_ALGORITHM]
    else:
        raise _unauthorized()

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            audience=SUPABASE_AUDIENCE,
        )
    except JWTError:
        raise _unauthorized()

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        raise _unauthorized()

    try:
        return UUID(sub)
    except ValueError:
        raise _unauthorized()
