"""Study-group post moderation: roles, the post lifecycle, and the authority matrix.

This is the non-trivial core of the multi-user study-groups feature. A group post
is user-generated content visible to every member of the group, so two questions
have to be answered on every interaction:

  1. *Who may do what?* — an authority matrix keyed on the actor's role in the
     group and their relationship to the post (are they its author?).
  2. *What state may a post move to?* — a moderation lifecycle state machine.

Both are pure functions of the actor's relationship to the group and post; they
carry no database, network, or framework dependency, which is what makes them
cheap to test exhaustively. The route layer in ``app/routes/group/*`` is the only
place that touches Postgres — it consults this module for every decision and then
persists the result.

Lifecycle
---------
A post's moderation status is one of:

    visible   — the default; shown in the feed to every member.
    flagged   — at least one member flagged it; still shown (with an indicator),
                pending a moderator's decision. This is post-publication
                moderation, deliberately *not* pre-approval: a Bible-study group
                shouldn't need a moderator awake before anyone can speak, but it
                does need a fast path to take bad content down.
    removed   — a moderator/owner took it down; hidden from other members, but
                still shown to the post's own author (so they can see their own
                comment was taken down, the way YouTube still shows you your own
                removed comment) and to moderators (so the action can be reviewed
                and reversed). Retained in the table for audit.

Legal transitions (the actor-authority check is applied first, separately):

    visible  --flag-->    flagged
    flagged  --flag-->    flagged    (idempotent: a second flag is recorded as a
                                      post_flag row but the status is unchanged)
    visible  --remove-->  removed
    flagged  --remove-->  removed
    flagged  --restore--> visible    (a moderator dismisses the flags)
    removed  --restore--> visible    (a moderator reinstates the post)

Every (status, action) pair not listed above is illegal and raises
``ModerationError``. In particular a ``removed`` post can neither be flagged nor
removed again, and a ``visible`` post has nothing to restore.

Author self-deletion (an author taking down their *own* post) is a separate
permission, ``can_delete_own_post`` — it is not a moderation transition and does
not pass through this state machine, because "the author changed their mind" and
"a moderator took it down" are different facts the audit trail must keep distinct.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional


class Role(str, Enum):
    """A member's role within a single group. Non-members have no Role (``None``)."""

    OWNER = "owner"
    MODERATOR = "moderator"
    MEMBER = "member"


class PostStatus(str, Enum):
    VISIBLE = "visible"
    FLAGGED = "flagged"
    REMOVED = "removed"


class ModerationAction(str, Enum):
    FLAG = "flag"
    REMOVE = "remove"
    RESTORE = "restore"


# Roles permitted to take down or reinstate another member's content.
MODERATOR_ROLES = frozenset({Role.OWNER, Role.MODERATOR})


class ModerationError(Exception):
    """Raised when an action is not permitted or the transition is illegal.

    ``reason`` is drawn from a small closed set so the route layer can map it to
    an HTTP status without parsing the message string:

        "not_a_member"        -> 403  (no membership row in this group)
        "forbidden"           -> 403  (a member, but lacks the role for this action)
        "self_flag"           -> 403  (you cannot flag your own post)
        "illegal_transition"  -> 409  (e.g. flag/remove an already-removed post)
    """

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


# Legal moderation transitions. Authority is checked *before* this table is
# consulted, so the table encodes only "what state may follow this state".
_TRANSITIONS: dict[tuple[PostStatus, ModerationAction], PostStatus] = {
    (PostStatus.VISIBLE, ModerationAction.FLAG): PostStatus.FLAGGED,
    (PostStatus.FLAGGED, ModerationAction.FLAG): PostStatus.FLAGGED,  # idempotent
    (PostStatus.VISIBLE, ModerationAction.REMOVE): PostStatus.REMOVED,
    (PostStatus.FLAGGED, ModerationAction.REMOVE): PostStatus.REMOVED,
    (PostStatus.FLAGGED, ModerationAction.RESTORE): PostStatus.VISIBLE,
    (PostStatus.REMOVED, ModerationAction.RESTORE): PostStatus.VISIBLE,
}


def is_member(role: Optional[Role]) -> bool:
    """True if the actor has any role in the group (owner, moderator, or member)."""
    return role is not None


def can_create_post(role: Optional[Role]) -> bool:
    """Any member may post into a group they belong to; non-members may not."""
    return is_member(role)


def can_reply(role: Optional[Role], parent_status: PostStatus) -> bool:
    """A member may reply to a post that has not been removed.

    Replying to a removed post is disallowed: the parent is hidden from ordinary
    members, so a reply would dangle under content they can't see, and it keeps a
    removed thread from accreting new activity.
    """
    return is_member(role) and parent_status != PostStatus.REMOVED


def can_view_post(
    role: Optional[Role], status: PostStatus, is_author: bool = False
) -> bool:
    """Whether an actor may see a post in the given status.

    - Non-members see nothing: group feeds are members-only.
    - ``visible`` and ``flagged`` posts are shown to every member (a flagged post
      stays in the feed with an indicator until a moderator acts on it).
    - ``removed`` posts are shown to moderators/owners (so they can review and
      restore them) and to the post's own author (so they can see that their own
      comment was taken down, the way YouTube still shows you your own removed
      comment). To every other member a removed post is simply gone.
    """
    if not is_member(role):
        return False
    if status == PostStatus.REMOVED:
        return role in MODERATOR_ROLES or is_author
    return True


def visible_statuses_for(role: Optional[Role]) -> frozenset[PostStatus]:
    """The post statuses a viewer of this role may see — for the feed query.

    Returned as a set so the route layer can build a single ``status = ANY($n)``
    filter rather than re-deriving the rule per row.

    This is the role-only baseline (the non-author case). A member's own removed
    post is *also* visible to them, but that is row-dependent — it compares the
    viewer to each post's ``author_id`` — so the feed query expresses it as an
    extra ``OR (status = 'removed' AND author_id = $viewer)`` clause rather than
    folding it into this set.
    """
    if not is_member(role):
        return frozenset()
    if role in MODERATOR_ROLES:
        return frozenset(PostStatus)
    return frozenset({PostStatus.VISIBLE, PostStatus.FLAGGED})


def can_delete_own_post(role: Optional[Role], is_author: bool) -> bool:
    """An author who is still a member may delete their own post.

    This is author self-service, not moderation: it sets the post's
    ``deleted_at`` rather than moving it to ``removed``, keeping "the author
    withdrew this" distinct from "a moderator took this down" in the audit trail.
    """
    return is_member(role) and is_author


def _check_authority(
    action: ModerationAction, role: Optional[Role], is_author: bool
) -> None:
    """Raise ModerationError unless ``role`` may perform ``action``. Order matters:
    membership is checked first, then action-specific rules."""
    if not is_member(role):
        raise ModerationError("not_a_member", "you are not a member of this group")

    if action == ModerationAction.FLAG:
        # Any member may flag another member's post, but flagging your own is
        # meaningless and is a cheap way to spam the moderation queue.
        if is_author:
            raise ModerationError("self_flag", "you cannot flag your own post")
        return

    # remove / restore are moderator-only, regardless of authorship: an author
    # who merely wants their own post gone uses can_delete_own_post instead.
    if role not in MODERATOR_ROLES:
        raise ModerationError(
            "forbidden", f"only an owner or moderator may {action.value} a post"
        )


def transition(
    status: PostStatus,
    action: ModerationAction,
    role: Optional[Role],
    is_author: bool = False,
) -> PostStatus:
    """Resolve a moderation action to the post's next status.

    Applies the authority matrix first (raising ``ModerationError`` with a
    ``not_a_member`` / ``self_flag`` / ``forbidden`` reason), then the lifecycle
    transition table (raising ``illegal_transition`` for any disallowed
    status/action pair). Returns the new ``PostStatus`` — which equals the old one
    for an idempotent flag.
    """
    _check_authority(action, role, is_author)

    next_status = _TRANSITIONS.get((status, action))
    if next_status is None:
        raise ModerationError(
            "illegal_transition",
            f"cannot {action.value} a post that is {status.value}",
        )
    return next_status
