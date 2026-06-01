"""Bug-report table — web-only ticket log.

The web build gives signed-in users a "Report a bug" tab whose submissions
land here for later triage via the Supabase dashboard. Forward-only log:
no soft-delete (users don't edit/remove tickets) and no status column
(admin-side bookkeeping lives in the dashboard, not in our schema).

Shape mirrors 0002's user-data tables:
  - `id` is client-generated TEXT (ULID / UUID), same convention.
  - `user_id UUID NOT NULL` — every ticket comes from an authenticated
    user; the endpoint's JWT dependency enforces this.
  - `platform` is CHECK-constrained at the DB level so the column can't
    drift into freeform values if a future endpoint relaxes its Pydantic
    Literal.
  - `created_at` is ms-epoch BIGINT, matching the rest of user-data.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-01
"""
from alembic import op


revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE bug_report (
            id          TEXT PRIMARY KEY,
            user_id     UUID NOT NULL,
            platform    TEXT NOT NULL
                        CHECK (platform IN ('web', 'local')),
            description TEXT NOT NULL CHECK (length(description) > 0),
            created_at  BIGINT NOT NULL
        );
        CREATE INDEX bug_report_user_created_idx
            ON bug_report(user_id, created_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS bug_report;
        """
    )
