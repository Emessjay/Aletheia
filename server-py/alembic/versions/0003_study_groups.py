"""Study groups — multi-user, verse-anchored shared discussion.

The web build's first multi-user surface. Unlike the phase-3a user-data tables
(library/bookmark/highlight/note/kv), these rows are *shared* within a group
rather than private to one user, so the per-user "every read constrained to
``WHERE user_id = $n``" invariant from app/routes/user/* does NOT apply here.
Tenancy is instead by **group membership**: a row is reachable by a user iff
they hold a row in ``group_membership`` for that ``group_id``. The authority
rules and post lifecycle live in app/groups/moderation.py.

Conventions carried over from 0002:
  - ``id`` is TEXT (client-generated ULID/UUID).
  - User identity is a bare ``UUID`` (Supabase ``sub``); no FK to a users table.
  - Timestamps are BIGINT ms-epoch.
  - Soft-delete via ``deleted_at`` (author withdrawal), kept distinct from the
    moderator-driven ``status = 'removed'``.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-31
"""
from alembic import op


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE study_group (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
            invite_code  TEXT NOT NULL UNIQUE
                         CHECK (char_length(invite_code) BETWEEN 6 AND 32),
            created_by   UUID NOT NULL,
            created_at   BIGINT NOT NULL,
            deleted_at   BIGINT
        );

        CREATE TABLE group_membership (
            group_id     TEXT NOT NULL REFERENCES study_group(id) ON DELETE CASCADE,
            user_id      UUID NOT NULL,
            role         TEXT NOT NULL DEFAULT 'member'
                         CHECK (role IN ('owner', 'moderator', 'member')),
            joined_at    BIGINT NOT NULL,
            PRIMARY KEY (group_id, user_id)
        );
        -- "which groups am I in" — the membership lookup behind every authz check.
        CREATE INDEX group_membership_user_idx ON group_membership(user_id);

        CREATE TABLE group_post (
            id            TEXT PRIMARY KEY,
            group_id      TEXT NOT NULL REFERENCES study_group(id) ON DELETE CASCADE,
            parent_id     TEXT REFERENCES group_post(id) ON DELETE CASCADE,
            author_id     UUID NOT NULL,
            -- verse anchor: same shape as the highlight/note tables in 0002.
            work_slug     TEXT NOT NULL,
            book_slug     TEXT NOT NULL,
            chapter       INTEGER NOT NULL,
            verse         INTEGER NOT NULL,
            translation   TEXT,
            body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
            status        TEXT NOT NULL DEFAULT 'visible'
                          CHECK (status IN ('visible', 'flagged', 'removed')),
            -- audit of the last moderation action (NULL until a moderator acts).
            moderated_by  UUID,
            moderated_at  BIGINT,
            created_at    BIGINT NOT NULL,
            updated_at    BIGINT NOT NULL,
            deleted_at    BIGINT
        );
        -- the feed query: a group's posts at a verse, newest first, live rows only.
        CREATE INDEX group_post_feed_idx
            ON group_post(group_id, work_slug, book_slug, chapter, verse, created_at)
            WHERE deleted_at IS NULL;
        -- thread expansion: a parent's replies.
        CREATE INDEX group_post_parent_idx
            ON group_post(parent_id) WHERE deleted_at IS NULL;

        CREATE TABLE post_flag (
            id           TEXT PRIMARY KEY,
            post_id      TEXT NOT NULL REFERENCES group_post(id) ON DELETE CASCADE,
            flagged_by   UUID NOT NULL,
            reason       TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
            created_at   BIGINT NOT NULL,
            -- one standing flag per user per post; re-flagging is idempotent.
            UNIQUE (post_id, flagged_by)
        );
        CREATE INDEX post_flag_post_idx ON post_flag(post_id);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS post_flag;
        DROP TABLE IF EXISTS group_post;
        DROP TABLE IF EXISTS group_membership;
        DROP TABLE IF EXISTS study_group;
        """
    )
