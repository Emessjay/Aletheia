"""Unit tests for the study-group moderation core (app/groups/moderation.py).

Pure logic — no database, no event loop — so this suite runs unconditionally in
CI (the integration suites skip without DATABASE_URL; this one never does). It is
the regression net for the feature's non-trivial piece: the authority matrix and
the post-moderation state machine.
"""
import pytest

from app.groups.moderation import (
    MODERATOR_ROLES,
    ModerationAction,
    ModerationError,
    PostStatus,
    Role,
    can_create_post,
    can_delete_own_post,
    can_reply,
    can_view_post,
    is_member,
    transition,
    visible_statuses_for,
)

ALL_ROLES = [Role.OWNER, Role.MODERATOR, Role.MEMBER]
MOD_ROLES = [Role.OWNER, Role.MODERATOR]


# --------------------------------------------------------------------------- #
# Membership / posting / replying                                             #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("role", ALL_ROLES)
def test_members_may_post(role):
    assert is_member(role) is True
    assert can_create_post(role) is True


def test_non_member_may_not_post():
    assert is_member(None) is False
    assert can_create_post(None) is False


@pytest.mark.parametrize("role", ALL_ROLES)
@pytest.mark.parametrize("parent_status", [PostStatus.VISIBLE, PostStatus.FLAGGED])
def test_members_may_reply_to_live_parent(role, parent_status):
    assert can_reply(role, parent_status) is True


@pytest.mark.parametrize("role", ALL_ROLES)
def test_nobody_replies_to_a_removed_post(role):
    assert can_reply(role, PostStatus.REMOVED) is False


def test_non_member_may_not_reply():
    assert can_reply(None, PostStatus.VISIBLE) is False


# --------------------------------------------------------------------------- #
# View rules                                                                  #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("status", list(PostStatus))
def test_non_member_sees_nothing(status):
    assert can_view_post(None, status) is False


@pytest.mark.parametrize("role", ALL_ROLES)
@pytest.mark.parametrize("status", [PostStatus.VISIBLE, PostStatus.FLAGGED])
def test_every_member_sees_live_and_flagged(role, status):
    assert can_view_post(role, status) is True


def test_removed_posts_visible_to_moderators_and_the_author_only():
    # A member who is not the author: the removed post is gone.
    assert can_view_post(Role.MEMBER, PostStatus.REMOVED) is False
    # The author, even as a plain member, still sees their own removed post
    # (the YouTube model — you can see your own comment was taken down).
    assert can_view_post(Role.MEMBER, PostStatus.REMOVED, is_author=True) is True
    # Moderators and owners always see removed posts, author or not.
    assert can_view_post(Role.MODERATOR, PostStatus.REMOVED) is True
    assert can_view_post(Role.OWNER, PostStatus.REMOVED) is True
    # Authorship never overrides the members-only wall: a non-member sees nothing.
    assert can_view_post(None, PostStatus.REMOVED, is_author=True) is False


def test_author_visibility_does_not_change_live_or_flagged_posts():
    # is_author only matters for removed posts; visible/flagged are seen by all
    # members regardless, so the flag must not accidentally widen anything.
    for status in (PostStatus.VISIBLE, PostStatus.FLAGGED):
        assert can_view_post(Role.MEMBER, status, is_author=True) is True
        assert can_view_post(Role.MEMBER, status, is_author=False) is True


def test_visible_statuses_for_matches_view_rule():
    assert visible_statuses_for(None) == frozenset()
    assert visible_statuses_for(Role.MEMBER) == frozenset(
        {PostStatus.VISIBLE, PostStatus.FLAGGED}
    )
    assert visible_statuses_for(Role.MODERATOR) == frozenset(PostStatus)
    assert visible_statuses_for(Role.OWNER) == frozenset(PostStatus)
    # The set helper is the role-only (non-author) baseline; it must agree with
    # the per-row predicate for a non-author viewer. The author-sees-own-removed
    # case is row-dependent and intentionally lives outside this set (covered by
    # test_removed_posts_visible_to_moderators_and_the_author_only).
    for role in ALL_ROLES + [None]:
        allowed = visible_statuses_for(role)
        for status in PostStatus:
            assert (status in allowed) == can_view_post(role, status, is_author=False)


# --------------------------------------------------------------------------- #
# Author self-deletion (not a moderation transition)                          #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("role", ALL_ROLES)
def test_author_may_delete_own_post(role):
    assert can_delete_own_post(role, is_author=True) is True


@pytest.mark.parametrize("role", ALL_ROLES)
def test_non_author_may_not_self_delete(role):
    assert can_delete_own_post(role, is_author=False) is False


def test_non_member_may_not_self_delete():
    assert can_delete_own_post(None, is_author=True) is False


# --------------------------------------------------------------------------- #
# State machine — legal transitions                                           #
# --------------------------------------------------------------------------- #
def test_member_flag_makes_visible_post_flagged():
    assert (
        transition(PostStatus.VISIBLE, ModerationAction.FLAG, Role.MEMBER)
        == PostStatus.FLAGGED
    )


def test_flag_is_idempotent_on_already_flagged():
    # A second flag is recorded as a post_flag row but the status is unchanged.
    assert (
        transition(PostStatus.FLAGGED, ModerationAction.FLAG, Role.MEMBER)
        == PostStatus.FLAGGED
    )


@pytest.mark.parametrize("role", MOD_ROLES)
@pytest.mark.parametrize("start", [PostStatus.VISIBLE, PostStatus.FLAGGED])
def test_moderator_removes_live_post(role, start):
    assert transition(start, ModerationAction.REMOVE, role) == PostStatus.REMOVED


@pytest.mark.parametrize("role", MOD_ROLES)
@pytest.mark.parametrize("start", [PostStatus.FLAGGED, PostStatus.REMOVED])
def test_moderator_restores_to_visible(role, start):
    assert transition(start, ModerationAction.RESTORE, role) == PostStatus.VISIBLE


def test_owner_has_every_moderator_power():
    # Whatever a moderator may do, an owner may do — guards against the matrix
    # ever drifting so that OWNER is not a superset of MODERATOR.
    assert MODERATOR_ROLES == frozenset({Role.OWNER, Role.MODERATOR})
    for action, start in [
        (ModerationAction.REMOVE, PostStatus.VISIBLE),
        (ModerationAction.RESTORE, PostStatus.REMOVED),
    ]:
        assert transition(start, action, Role.OWNER) == transition(
            start, action, Role.MODERATOR
        )


# --------------------------------------------------------------------------- #
# State machine — authority failures                                          #
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("action", list(ModerationAction))
def test_non_member_cannot_moderate(action):
    with pytest.raises(ModerationError) as exc:
        transition(PostStatus.VISIBLE, action, None)
    assert exc.value.reason == "not_a_member"


def test_author_cannot_flag_own_post():
    with pytest.raises(ModerationError) as exc:
        transition(PostStatus.VISIBLE, ModerationAction.FLAG, Role.MEMBER, is_author=True)
    assert exc.value.reason == "self_flag"


def test_moderator_author_still_cannot_flag_own_post():
    # The self-flag bar is about authorship, not role — a moderator can't flag
    # their own post either (they'd just remove it).
    with pytest.raises(ModerationError) as exc:
        transition(PostStatus.VISIBLE, ModerationAction.FLAG, Role.OWNER, is_author=True)
    assert exc.value.reason == "self_flag"


@pytest.mark.parametrize("action", [ModerationAction.REMOVE, ModerationAction.RESTORE])
def test_plain_member_cannot_remove_or_restore(action):
    start = PostStatus.VISIBLE if action == ModerationAction.REMOVE else PostStatus.REMOVED
    with pytest.raises(ModerationError) as exc:
        transition(start, action, Role.MEMBER)
    assert exc.value.reason == "forbidden"


# --------------------------------------------------------------------------- #
# State machine — illegal transitions (authority OK, state wrong)             #
# --------------------------------------------------------------------------- #
def test_cannot_flag_a_removed_post():
    with pytest.raises(ModerationError) as exc:
        transition(PostStatus.REMOVED, ModerationAction.FLAG, Role.MEMBER)
    assert exc.value.reason == "illegal_transition"


@pytest.mark.parametrize("role", MOD_ROLES)
def test_cannot_remove_an_already_removed_post(role):
    with pytest.raises(ModerationError) as exc:
        transition(PostStatus.REMOVED, ModerationAction.REMOVE, role)
    assert exc.value.reason == "illegal_transition"


@pytest.mark.parametrize("role", MOD_ROLES)
def test_cannot_restore_a_visible_post(role):
    with pytest.raises(ModerationError) as exc:
        transition(PostStatus.VISIBLE, ModerationAction.RESTORE, role)
    assert exc.value.reason == "illegal_transition"


def test_authority_is_checked_before_transition_legality():
    # A non-member flagging a removed post fails on membership, not on the
    # illegal state pair — the order the route layer relies on for its 403-vs-409.
    with pytest.raises(ModerationError) as exc:
        transition(PostStatus.REMOVED, ModerationAction.FLAG, None)
    assert exc.value.reason == "not_a_member"
