"""Shared helpers for the study-group routes.

Kept deliberately free of FastAPI / asyncpg imports so the pure pieces
(`new_invite_code`, `http_status_for`) are unit-testable without a database
or an app instance. `get_role` takes an already-acquired connection.
"""
from __future__ import annotations

import secrets
from typing import Any, Optional

from ...groups.moderation import Role

# Reuse the id/timestamp helpers from the user-data package rather than
# duplicating them — same TEXT-id + ms-epoch conventions apply here.
from ..user._common import new_id, now_ms  # noqa: F401  (re-exported)


# Invite codes are typed by humans, so the alphabet drops the easily-confused
# glyphs (I/1/L, O/0, U). 8 chars over a 30-char alphabet ≈ 6.6e11 codes —
# collisions are astronomically unlikely, and the caller retries on the rare
# UNIQUE violation anyway.
_INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"


def new_invite_code(length: int = 8) -> str:
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(length))


# Map a moderation.ModerationError.reason to an HTTP status. Membership/role
# failures are 403 (you may not do this); a legal-but-wrong state transition is
# 409 (conflict with the post's current state). Anything unrecognized is a 400.
_STATUS_FOR_REASON = {
    "not_a_member": 403,
    "forbidden": 403,
    "self_flag": 403,
    "illegal_transition": 409,
}


def http_status_for(reason: str) -> int:
    return _STATUS_FOR_REASON.get(reason, 400)


async def get_role(conn: Any, group_id: str, user_id: Any) -> Optional[Role]:
    """The actor's role in this group, or None if they hold no membership row.

    This is the authority primitive every group route calls before consulting
    ``app.groups.moderation``: membership is what tenancy is keyed on here (a
    row is reachable iff you're in the group), not the per-user ``user_id``
    scoping the ``/api/user/*`` routes use.
    """
    row = await conn.fetchrow(
        "SELECT role FROM group_membership WHERE group_id = $1 AND user_id = $2",
        group_id,
        user_id,
    )
    return Role(row["role"]) if row else None
