"""Deduplicate bookmarks and enforce uniqueness per (library, verse anchor).

Found in the pre-demo phone audit: tapping a library chip repeatedly created
one identical bookmark per tap — the classic submitted-twice-fast hole.
There was no uniqueness rule on a bookmark's anchor, client or server.

Two steps, in order:

1. Soft-delete existing duplicates, keeping the earliest row per
   (user, library, anchor). Soft-delete (not DELETE) matches the table's
   tombstone convention from 0002.
2. Add a partial unique index over the *live* rows. Nullable anchor parts
   (book_slug/chapter/verse/translation) are COALESCE'd inside the index
   expression because Postgres unique indexes treat NULLs as distinct,
   which would let NULL-translation duplicates through.

The create route pairs with this via ON CONFLICT ... DO NOTHING and
returns the existing row — an idempotent create, so a double-tap is a
no-op end to end.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-03
"""
from alembic import op


revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   ROW_NUMBER() OVER (
                       PARTITION BY user_id, library_id, work_slug,
                                    COALESCE(book_slug, ''),
                                    COALESCE(chapter, -1),
                                    COALESCE(verse, -1),
                                    COALESCE(translation, '')
                       ORDER BY created_at, id
                   ) AS rn
              FROM bookmark
             WHERE deleted_at IS NULL
        )
        UPDATE bookmark b
           SET deleted_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint,
               updated_at = (EXTRACT(EPOCH FROM now()) * 1000)::bigint
          FROM ranked r
         WHERE b.id = r.id AND r.rn > 1;

        CREATE UNIQUE INDEX bookmark_unique_anchor_idx
            ON bookmark (user_id, library_id, work_slug,
                         COALESCE(book_slug, ''),
                         COALESCE(chapter, -1),
                         COALESCE(verse, -1),
                         COALESCE(translation, ''))
         WHERE deleted_at IS NULL;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS bookmark_unique_anchor_idx;")
