"""Unit tests for the pure group-route helpers (no DB, no app)."""
import pytest

from app.groups.moderation import (
    ModerationAction,
    ModerationError,
    PostStatus,
    Role,
    transition,
)
from app.routes.group._common import (
    _INVITE_ALPHABET,
    http_status_for,
    new_invite_code,
)


def test_invite_code_default_length_and_alphabet():
    code = new_invite_code()
    assert len(code) == 8
    assert all(c in _INVITE_ALPHABET for c in code)


def test_invite_code_avoids_ambiguous_glyphs():
    # I/L/O/U and 0/1 are confusable when typed by hand — never emitted.
    blob = "".join(new_invite_code(16) for _ in range(100))
    assert not (set("ILOU01") & set(blob))


def test_invite_code_custom_length():
    assert len(new_invite_code(12)) == 12


def test_invite_codes_differ():
    # 30**8 space — a collision here would be a broken RNG, not bad luck.
    assert new_invite_code() != new_invite_code()


@pytest.mark.parametrize(
    "reason,expected",
    [
        ("not_a_member", 403),
        ("forbidden", 403),
        ("self_flag", 403),
        ("illegal_transition", 409),
        ("anything_unrecognized", 400),
    ],
)
def test_http_status_for(reason, expected):
    assert http_status_for(reason) == expected


@pytest.mark.parametrize(
    "status,action,role,is_author,expected_status",
    [
        (PostStatus.VISIBLE, ModerationAction.FLAG, None, False, 403),       # not_a_member
        (PostStatus.VISIBLE, ModerationAction.FLAG, Role.MEMBER, True, 403),  # self_flag
        (PostStatus.VISIBLE, ModerationAction.REMOVE, Role.MEMBER, False, 403),  # forbidden
        (PostStatus.REMOVED, ModerationAction.REMOVE, Role.OWNER, False, 409),   # illegal
    ],
)
def test_real_moderation_errors_map_to_expected_status(
    status, action, role, is_author, expected_status
):
    # The route layer relies on every ModerationError.reason resolving to a
    # sensible HTTP status — pin the two modules together.
    with pytest.raises(ModerationError) as exc:
        transition(status, action, role, is_author)
    assert http_status_for(exc.value.reason) == expected_status
