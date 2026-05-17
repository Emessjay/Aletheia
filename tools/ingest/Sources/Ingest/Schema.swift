import Foundation
import GRDB

/// Schema version. Bump when adding/removing tables; the app's SQLite consumer doesn't migrate
/// (the file is shipped read-only) — instead, regenerate the bundle and ship a new build.
public let schemaVersion: Int = 3

public enum Schema {
    public static func create(_ db: Database) throws {
        try db.execute(sql: "PRAGMA foreign_keys = ON;")
        // Intentionally not enabling WAL: the corpus is single-writer at build time and
        // shipped read-only at runtime, where the app can't create -wal/-shm sidecar files.

        // -- Bible / Scripture -------------------------------------------------------
        try db.execute(sql: """
            CREATE TABLE book (
                id          INTEGER PRIMARY KEY,
                language    TEXT NOT NULL,            -- he | gk | en_bsb | en_kjv | en_brenton
                canon       TEXT NOT NULL,            -- protestant | deutero
                slug        TEXT NOT NULL,            -- 'gen', 'john', '1mac'
                name        TEXT NOT NULL,
                abbreviation TEXT NOT NULL,
                testament   TEXT NOT NULL,            -- old | deutero | new
                order_index INTEGER NOT NULL,
                UNIQUE(language, slug)
            );
            """)
        try db.execute(sql: "CREATE INDEX book_lang_idx ON book(language);")

        try db.execute(sql: """
            CREATE TABLE chapter (
                id          INTEGER PRIMARY KEY,
                book_id     INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
                number      INTEGER NOT NULL,
                verse_count INTEGER NOT NULL DEFAULT 0,
                UNIQUE(book_id, number)
            );
            """)

        try db.execute(sql: """
            CREATE TABLE verse (
                id          INTEGER PRIMARY KEY,
                chapter_id  INTEGER NOT NULL REFERENCES chapter(id) ON DELETE CASCADE,
                number      INTEGER NOT NULL,
                text        TEXT NOT NULL,            -- raw text with optional inline markup
                text_plain  TEXT NOT NULL,            -- markup-stripped form for FTS
                lead        TEXT,                     -- USFM line marker before this verse: 'p','m','nb','pi','q1','q2','q3','b'; NULL = continues prior verse inline
                UNIQUE(chapter_id, number)
            );
            """)

        try db.execute(sql: """
            CREATE TABLE word (
                id          INTEGER PRIMARY KEY,
                verse_id    INTEGER NOT NULL REFERENCES verse(id) ON DELETE CASCADE,
                position    INTEGER NOT NULL,
                surface     TEXT NOT NULL,
                lemma       TEXT,
                strongs     TEXT,                     -- 'H6268' or 'G2316'
                morphology  TEXT,
                base_text   TEXT,                     -- 'NA28' | 'BYZ' | 'TR' | NULL
                english     TEXT,                     -- BSB-derived contextual English (STEPBible col 3)
                UNIQUE(verse_id, position, base_text)
            );
            """)
        try db.execute(sql: "CREATE INDEX word_strongs_idx ON word(strongs);")
        try db.execute(sql: "CREATE INDEX word_lemma_idx ON word(lemma);")

        // -- Lexicon ----------------------------------------------------------------
        try db.execute(sql: """
            CREATE TABLE strongs (
                id              TEXT PRIMARY KEY,     -- 'H6268', 'G2316'
                language        TEXT NOT NULL,        -- he | gk
                lemma           TEXT NOT NULL,
                transliteration TEXT,
                gloss           TEXT NOT NULL DEFAULT '',
                definition      TEXT NOT NULL DEFAULT '',
                kjv_usage       TEXT,
                lemma_lower     TEXT NOT NULL DEFAULT ''
            );
            """)
        try db.execute(sql: "CREATE INDEX strongs_lemma_idx ON strongs(lemma_lower);")

        // -- Cross references -------------------------------------------------------
        try db.execute(sql: """
            CREATE TABLE xref (
                id              INTEGER PRIMARY KEY,
                from_verse_id   INTEGER NOT NULL REFERENCES verse(id) ON DELETE CASCADE,
                to_verse_start  INTEGER NOT NULL REFERENCES verse(id) ON DELETE CASCADE,
                to_verse_end    INTEGER REFERENCES verse(id) ON DELETE SET NULL,
                weight          REAL NOT NULL DEFAULT 0
            );
            """)
        try db.execute(sql: "CREATE INDEX xref_from_idx ON xref(from_verse_id);")

        // -- Patristic works --------------------------------------------------------
        try db.execute(sql: """
            CREATE TABLE work (
                id      INTEGER PRIMARY KEY,
                slug    TEXT NOT NULL UNIQUE,
                title   TEXT NOT NULL,
                author  TEXT NOT NULL,
                kind    TEXT NOT NULL                 -- 'summa' | 'dialogue' | 'treatise'
            );
            """)
        try db.execute(sql: """
            CREATE TABLE section (
                id           INTEGER PRIMARY KEY,
                work_id      INTEGER NOT NULL REFERENCES work(id) ON DELETE CASCADE,
                parent_id    INTEGER REFERENCES section(id) ON DELETE CASCADE,
                ordinal_path TEXT NOT NULL,           -- '1.Q1.A1.respondeo', 'trypho.31'
                kind         TEXT NOT NULL,           -- 'part'|'question'|'article'|'objection'|'reply'|'respondeo'|'sedcontra'|'chapter'|'section'
                label        TEXT,
                language     TEXT NOT NULL,           -- en | gr | la
                body         TEXT NOT NULL,
                ordering     INTEGER NOT NULL DEFAULT 0,
                UNIQUE(work_id, ordinal_path, language)
            );
            """)
        try db.execute(sql: "CREATE INDEX section_path_idx ON section(work_id, ordinal_path);")

        try db.execute(sql: """
            CREATE TABLE citation (
                id          INTEGER PRIMARY KEY,
                section_id  INTEGER NOT NULL REFERENCES section(id) ON DELETE CASCADE,
                book_slug   TEXT NOT NULL,
                chapter     INTEGER NOT NULL,
                verse_start INTEGER NOT NULL,
                verse_end   INTEGER NOT NULL,
                span_start  INTEGER NOT NULL,         -- character offset in section.body
                span_end    INTEGER NOT NULL
            );
            """)
        try db.execute(sql: "CREATE INDEX citation_section_idx ON citation(section_id);")

        // -- FTS5 search ------------------------------------------------------------
        try db.execute(sql: """
            CREATE VIRTUAL TABLE verse_fts USING fts5(
                text,
                content='verse',
                content_rowid='id',
                tokenize="unicode61 remove_diacritics 2"
            );
            """)
        try db.execute(sql: """
            CREATE TRIGGER verse_fts_ai AFTER INSERT ON verse BEGIN
                INSERT INTO verse_fts(rowid, text) VALUES (new.id, new.text_plain);
            END;
            """)

        try db.execute(sql: """
            CREATE VIRTUAL TABLE section_fts USING fts5(
                body,
                content='section',
                content_rowid='id',
                tokenize="unicode61 remove_diacritics 2"
            );
            """)
        try db.execute(sql: """
            CREATE TRIGGER section_fts_ai AFTER INSERT ON section BEGIN
                INSERT INTO section_fts(rowid, body) VALUES (new.id, new.body);
            END;
            """)

        // -- Metadata ---------------------------------------------------------------
        try db.execute(sql: """
            CREATE TABLE meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """)
        try db.execute(sql: "INSERT INTO meta(key, value) VALUES ('schema_version', ?);",
                       arguments: [String(schemaVersion)])
        try db.execute(sql: "INSERT INTO meta(key, value) VALUES ('built_at', ?);",
                       arguments: [ISO8601DateFormatter().string(from: Date())])
    }
}
