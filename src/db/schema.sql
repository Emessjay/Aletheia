-- Aletheia user data schema v1
-- ULID PKs, ms-epoch timestamps, soft-delete tombstones (sync-friendly: no FKs across user data)

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS libraries (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_libraries_live
    ON libraries(sort_order) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS bookmarks (
    id           TEXT PRIMARY KEY,
    library_id   TEXT NOT NULL,
    work_slug    TEXT NOT NULL,
    book_slug    TEXT,
    chapter      INTEGER,
    verse        INTEGER,
    label        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_library
    ON bookmarks(library_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bookmarks_verse
    ON bookmarks(work_slug, book_slug, chapter, verse) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS highlights (
    id           TEXT PRIMARY KEY,
    work_slug    TEXT NOT NULL,
    book_slug    TEXT NOT NULL,
    chapter      INTEGER NOT NULL,
    verse        INTEGER NOT NULL,
    translation  TEXT,                                                  -- NULL = universal
    color        TEXT NOT NULL CHECK(color IN ('yellow','green','blue','pink','purple','orange')),
    start_token  INTEGER,
    end_token    INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_highlights_verse
    ON highlights(work_slug, book_slug, chapter, verse) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_highlights_color
    ON highlights(color) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    work_slug    TEXT NOT NULL,
    book_slug    TEXT NOT NULL,
    chapter      INTEGER NOT NULL,
    verse        INTEGER NOT NULL,
    body         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    deleted_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_notes_verse
    ON notes(work_slug, book_slug, chapter, verse) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS kv (
    key          TEXT PRIMARY KEY,
    value        TEXT NOT NULL,
    updated_at   INTEGER NOT NULL
);
