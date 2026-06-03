"""Profiles — a public display name per user.

The phase-3a decision ("no users table on our side, just a ``user_id UUID``
column") still holds for *identity* — Supabase owns sign-up, passwords, and
the JWT. This table adds the one attribute of other users the UI needs:
a human-readable display name to render on group posts instead of a
truncated UUID.

The name is resolved at read time via LEFT JOIN in app/routes/group/posts.py,
NOT denormalized onto group_post — a rename instantly applies to every
existing post, at the cost of one indexed join per feed read. Display names
are deliberately non-unique (they label posts inside small groups; they are
not identities — the UUID stays the identity).

Conventions carried over from 0004:
  - user_id is a bare UUID (Supabase ``sub``); no FK to a users table.
  - Timestamps are BIGINT ms-epoch.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-03
"""
from alembic import op


revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE profile (
            user_id      UUID PRIMARY KEY,
            display_name TEXT NOT NULL
                         CHECK (char_length(display_name) BETWEEN 1 AND 50),
            created_at   BIGINT NOT NULL,
            updated_at   BIGINT NOT NULL
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE profile;")
