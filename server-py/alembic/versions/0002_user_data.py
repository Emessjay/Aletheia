"""User-data schema — Postgres port of src/db/schema.sql + 0002_per_side_annotations.

Phase 3a (Supabase Auth) ships the web build's user-data layer in Postgres,
scoped per-user by a UUID column populated from the verified JWT `sub`. The
Tauri build keeps using bundled SQLite via plugin-sql; this migration is
web-only.

Differences from the SQLite source:
  - Every table gets a `user_id UUID NOT NULL` column. No FK to a users
    table — Supabase Auth owns the user records, and we trust the verified
    JWT.
  - Read-path indices include user_id as the leading column.
  - Timestamps are BIGINT (ms-epoch) instead of SQLite INTEGER — avoids
    32-bit-overflow ambiguity.
  - Table names are singular (`library`, `bookmark`, `highlight`, `note`,
    `kv`) to match the spec's endpoint convention. The Tauri side still uses
    plural names locally; the two never share storage.
  - `id` stays TEXT (frontend generates ULIDs / UUIDs client-side).

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-26
"""
from alembic import op


revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE library (
            id           TEXT PRIMARY KEY,
            user_id      UUID NOT NULL,
            name         TEXT NOT NULL,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            created_at   BIGINT NOT NULL,
            updated_at   BIGINT NOT NULL,
            deleted_at   BIGINT
        );
        CREATE INDEX library_user_live_idx
            ON library(user_id, sort_order) WHERE deleted_at IS NULL;

        CREATE TABLE bookmark (
            id           TEXT PRIMARY KEY,
            user_id      UUID NOT NULL,
            library_id   TEXT NOT NULL,
            work_slug    TEXT NOT NULL,
            book_slug    TEXT,
            chapter      INTEGER,
            verse        INTEGER,
            translation  TEXT,
            label        TEXT,
            created_at   BIGINT NOT NULL,
            updated_at   BIGINT NOT NULL,
            deleted_at   BIGINT
        );
        CREATE INDEX bookmark_user_library_idx
            ON bookmark(user_id, library_id) WHERE deleted_at IS NULL;
        CREATE INDEX bookmark_user_verse_idx
            ON bookmark(user_id, work_slug, book_slug, chapter, verse)
            WHERE deleted_at IS NULL;

        CREATE TABLE highlight (
            id           TEXT PRIMARY KEY,
            user_id      UUID NOT NULL,
            work_slug    TEXT NOT NULL,
            book_slug    TEXT NOT NULL,
            chapter      INTEGER NOT NULL,
            verse        INTEGER NOT NULL,
            translation  TEXT,
            color        TEXT NOT NULL
                         CHECK (color IN ('yellow','green','blue','pink','purple','orange')),
            start_token  INTEGER,
            end_token    INTEGER,
            created_at   BIGINT NOT NULL,
            updated_at   BIGINT NOT NULL,
            deleted_at   BIGINT
        );
        CREATE INDEX highlight_user_verse_idx
            ON highlight(user_id, work_slug, book_slug, chapter, verse)
            WHERE deleted_at IS NULL;

        CREATE TABLE note (
            id           TEXT PRIMARY KEY,
            user_id      UUID NOT NULL,
            work_slug    TEXT NOT NULL,
            book_slug    TEXT NOT NULL,
            chapter      INTEGER NOT NULL,
            verse        INTEGER NOT NULL,
            body         TEXT NOT NULL,
            created_at   BIGINT NOT NULL,
            updated_at   BIGINT NOT NULL,
            deleted_at   BIGINT
        );
        CREATE INDEX note_user_verse_idx
            ON note(user_id, work_slug, book_slug, chapter, verse)
            WHERE deleted_at IS NULL;

        CREATE TABLE kv (
            user_id      UUID NOT NULL,
            key          TEXT NOT NULL,
            value        TEXT NOT NULL,
            updated_at   BIGINT NOT NULL,
            PRIMARY KEY (user_id, key)
        );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS kv;
        DROP TABLE IF EXISTS note;
        DROP TABLE IF EXISTS highlight;
        DROP TABLE IF EXISTS bookmark;
        DROP TABLE IF EXISTS library;
        """
    )
