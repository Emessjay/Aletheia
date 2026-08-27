"""Collapse duplicate word rows and unique on COALESCE(base_text, '').

Hebrew TAHOT rows always have NULL base_text. SQLite and Postgres both treat
NULLs as distinct in UNIQUE indexes by default, so a partial STEPBible Hebrew
re-ingest inserted a second identical row per (verse_id, position). The reader
then rendered every surface twice.

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-27
"""

from alembic import op


revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Keep the lowest id per (verse, position, base_text).
    op.execute(
        """
        DELETE FROM word w
         USING word keep
         WHERE w.verse_id = keep.verse_id
           AND w.position = keep.position
           AND COALESCE(w.base_text, '') = COALESCE(keep.base_text, '')
           AND w.id > keep.id
        """
    )
    op.execute("DROP INDEX IF EXISTS word_verse_pos_base_idx")
    op.execute(
        """
        CREATE UNIQUE INDEX word_verse_pos_base_idx
            ON word (verse_id, position, COALESCE(base_text, ''))
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS word_verse_pos_base_idx")
    op.execute(
        """
        CREATE UNIQUE INDEX word_verse_pos_base_idx
            ON word (verse_id, position, base_text)
        """
    )
