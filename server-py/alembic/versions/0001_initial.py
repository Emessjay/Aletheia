"""Initial corpus schema — port of data/Aletheia.sqlite.

The SQLite source is the canonical artifact; Postgres mirrors it row-for-row.
Two Postgres-only additions:

  - `verse.search_vector` / `section.search_vector` (tsvector + GIN index)
    replace the SQLite FTS5 virtual tables. The /api/corpus router rewrites
    incoming `verse_fts MATCH $N` SQL to `search_vector @@ websearch_to_tsquery`
    so the frontend's SQL keeps working unchanged on the web build.
  - `search_vector` is a generated column over the indexed text field
    (verse.text_plain, section.body) — keeps it always in sync without a
    trigger, and avoids any post-ingest backfill.

Revision ID: 0001
Revises:
Create Date: 2026-05-21
"""
from alembic import op
import sqlalchemy as sa


revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE book (
            id           INTEGER PRIMARY KEY,
            language     TEXT NOT NULL,
            canon        TEXT NOT NULL,
            slug         TEXT NOT NULL,
            name         TEXT NOT NULL,
            abbreviation TEXT NOT NULL,
            testament    TEXT NOT NULL,
            order_index  INTEGER NOT NULL,
            UNIQUE (language, slug)
        );
        CREATE INDEX book_lang_idx ON book(language);

        CREATE TABLE chapter (
            id          INTEGER PRIMARY KEY,
            book_id     INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
            number      INTEGER NOT NULL,
            verse_count INTEGER NOT NULL DEFAULT 0,
            UNIQUE (book_id, number)
        );

        CREATE TABLE verse (
            id            INTEGER PRIMARY KEY,
            chapter_id    INTEGER NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
            number        INTEGER NOT NULL,
            text          TEXT NOT NULL,
            text_plain    TEXT NOT NULL,
            lead          TEXT,
            search_vector tsvector GENERATED ALWAYS AS
                (to_tsvector('english', text_plain)) STORED,
            UNIQUE (chapter_id, number)
        );
        CREATE INDEX verse_search_idx ON verse USING GIN (search_vector);

        CREATE TABLE word (
            id         INTEGER PRIMARY KEY,
            verse_id   INTEGER NOT NULL REFERENCES verse(id) ON DELETE CASCADE,
            position   INTEGER NOT NULL,
            surface    TEXT NOT NULL,
            lemma      TEXT,
            strongs    TEXT,
            morphology TEXT,
            base_text  TEXT,
            english    TEXT
        );
        -- The SQLite UNIQUE(verse_id, position, base_text) treats NULL base_text
        -- as distinct (SQLite default), so duplicates are technically allowed
        -- when base_text IS NULL. Postgres has the same NULLs-distinct default,
        -- so we mirror the constraint as-is.
        CREATE UNIQUE INDEX word_verse_pos_base_idx
            ON word(verse_id, position, base_text);
        CREATE INDEX word_strongs_idx ON word(strongs);
        CREATE INDEX word_lemma_idx ON word(lemma);

        CREATE TABLE strongs (
            id              TEXT PRIMARY KEY,
            language        TEXT NOT NULL,
            lemma           TEXT NOT NULL,
            transliteration TEXT,
            gloss           TEXT NOT NULL DEFAULT '',
            definition      TEXT NOT NULL DEFAULT '',
            kjv_usage       TEXT,
            lemma_lower     TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX strongs_lemma_idx ON strongs(lemma_lower);

        CREATE TABLE xref (
            id             INTEGER PRIMARY KEY,
            from_verse_id  INTEGER NOT NULL REFERENCES verse(id) ON DELETE CASCADE,
            to_verse_start INTEGER NOT NULL REFERENCES verse(id) ON DELETE CASCADE,
            to_verse_end   INTEGER REFERENCES verse(id) ON DELETE SET NULL,
            weight         REAL NOT NULL DEFAULT 0
        );
        CREATE INDEX xref_from_idx ON xref(from_verse_id);

        CREATE TABLE work (
            id     INTEGER PRIMARY KEY,
            slug   TEXT NOT NULL UNIQUE,
            title  TEXT NOT NULL,
            author TEXT NOT NULL,
            kind   TEXT NOT NULL
        );

        CREATE TABLE section (
            id            INTEGER PRIMARY KEY,
            work_id       INTEGER NOT NULL REFERENCES work(id) ON DELETE CASCADE,
            parent_id     INTEGER REFERENCES section(id) ON DELETE CASCADE,
            ordinal_path  TEXT NOT NULL,
            kind          TEXT NOT NULL,
            label         TEXT,
            language      TEXT NOT NULL,
            body          TEXT NOT NULL,
            ordering      INTEGER NOT NULL DEFAULT 0,
            search_vector tsvector GENERATED ALWAYS AS
                (to_tsvector('english', body)) STORED,
            UNIQUE (work_id, ordinal_path, language)
        );
        CREATE INDEX section_path_idx ON section(work_id, ordinal_path);
        CREATE INDEX section_search_idx ON section USING GIN (search_vector);

        CREATE TABLE citation (
            id          INTEGER PRIMARY KEY,
            section_id  INTEGER NOT NULL REFERENCES section(id) ON DELETE CASCADE,
            book_slug   TEXT NOT NULL,
            chapter     INTEGER NOT NULL,
            verse_start INTEGER NOT NULL,
            verse_end   INTEGER NOT NULL,
            span_start  INTEGER NOT NULL,
            span_end    INTEGER NOT NULL
        );
        CREATE INDEX citation_section_idx ON citation(section_id);

        CREATE TABLE meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP TABLE IF EXISTS citation;
        DROP TABLE IF EXISTS section;
        DROP TABLE IF EXISTS work;
        DROP TABLE IF EXISTS xref;
        DROP TABLE IF EXISTS strongs;
        DROP TABLE IF EXISTS word;
        DROP TABLE IF EXISTS verse;
        DROP TABLE IF EXISTS chapter;
        DROP TABLE IF EXISTS book;
        DROP TABLE IF EXISTS meta;
        """
    )
