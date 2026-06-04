"""ES256 (JWKS) verification path — the scheme production actually uses.

Current Supabase projects sign end-user JWTs with a project ES256 key and
publish the public half as a JWKS; the legacy HS256 shared secret in the
dashboard never signs anything. These tests mint real ES256 tokens with a
locally generated P-256 key, install the matching public JWK on
``app.state.jwks`` (standing in for the boot-time fetch), and exercise the
acceptance/rejection contract end to end through a real route.

The HS256 path keeps its own coverage in test_auth_jwt.py — the contract
here additionally pins that both schemes verify side by side, since the
test suite signs HS256 while production signs ES256.
"""
import base64
import os
import time

import pytest
from httpx import AsyncClient, ASGITransport
from jose import jwt

from .auth_helpers import ALICE_ID, auth_client

pytestmark = [
    pytest.mark.skipif(
        not os.environ.get("DATABASE_URL"),
        reason="DATABASE_URL not set; integration tests require Postgres",
    ),
    pytest.mark.skipif(
        not os.environ.get("SUPABASE_JWT_SECRET"),
        reason="SUPABASE_JWT_SECRET not set; auth tests require a signing secret",
    ),
]

KID = "test-es256-key"


def _generate_keypair():
    """A P-256 keypair: PEM private (for signing) + public JWK (for verify)."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    private_key = ec.generate_private_key(ec.SECP256R1())
    pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()

    numbers = private_key.public_key().public_numbers()

    def b64url_uint(n: int) -> str:
        return (
            base64.urlsafe_b64encode(n.to_bytes(32, "big")).rstrip(b"=").decode()
        )

    jwk = {
        "kty": "EC",
        "crv": "P-256",
        "alg": "ES256",
        "use": "sig",
        "kid": KID,
        "x": b64url_uint(numbers.x),
        "y": b64url_uint(numbers.y),
    }
    return pem, jwk


def _mint_es256(pem: str, *, kid: str = KID, aud: str = "authenticated") -> str:
    payload = {
        "sub": ALICE_ID,
        "aud": aud,
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, pem, algorithm="ES256", headers={"kid": kid})


@pytest.fixture(scope="module")
def keypair():
    return _generate_keypair()


@pytest.fixture()
def app_with_jwks(keypair):
    """The app with the test public key installed as the cached JWKS.

    Mirrors what the lifespan does in production (fetch + cache); restored
    to None afterward so other test modules see the default state.
    """
    from app.main import app

    _, jwk = keypair
    app.state.jwks = {"keys": [jwk]}
    yield app
    app.state.jwks = None


def _client(app, token: str) -> AsyncClient:
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {token}"},
    )


@pytest.mark.asyncio
async def test_valid_es256_token_is_accepted(app_with_jwks, keypair):
    pem, _ = keypair
    async with _client(app_with_jwks, _mint_es256(pem)) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_es256_signed_by_wrong_key_returns_401(app_with_jwks):
    other_pem, _ = _generate_keypair()
    async with _client(app_with_jwks, _mint_es256(other_pem)) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_es256_with_unknown_kid_returns_401(app_with_jwks, keypair):
    pem, _ = keypair
    async with _client(app_with_jwks, _mint_es256(pem, kid="not-our-key")) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_es256_with_wrong_audience_returns_401(app_with_jwks, keypair):
    pem, _ = keypair
    async with _client(app_with_jwks, _mint_es256(pem, aud="anon")) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_hs256_still_verifies_alongside_jwks(app_with_jwks):
    """Both schemes coexist: the legacy-secret path is selected by the
    token's own header, not by what happens to be cached on app.state."""
    async with auth_client(app_with_jwks, ALICE_ID) as client:
        resp = await client.get("/api/user/libraries")
    assert resp.status_code == 200
