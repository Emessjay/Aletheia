// Build a small in-memory SQLite that has just enough of the bundled-corpus
// schema for these tests to exercise queries.ts-style SQL and the server's
// /api/corpus routes. The real ingest pipeline (tools/ingest) writes a 2 GB
// database; the fixture is roughly 1 KB and lives in :memory:.
//
// Schema mirrors src/db/types.ts and src/db/schema.sql shapes only as far as
// the tested queries need — additional columns are omitted with NULLs where
// the row type allows it.

import Database from "better-sqlite3";

export interface FixtureRefs {
  bsbGenId: number;
  webTobitId: number;
  bsbGenCh1Id: number;
}

export function buildFixtureCorpus(): { db: Database.Database; refs: FixtureRefs } {
  const db = new Database(":memory:");
  db.pragma("journal_mode = MEMORY");

  db.exec(`
    CREATE TABLE book (
      id          INTEGER PRIMARY KEY,
      language    TEXT NOT NULL,
      canon       TEXT NOT NULL DEFAULT 'protestant',
      slug        TEXT NOT NULL,
      name        TEXT NOT NULL,
      abbreviation TEXT NOT NULL DEFAULT '',
      testament   TEXT NOT NULL DEFAULT 'old',
      order_index INTEGER NOT NULL
    );
    CREATE TABLE chapter (
      id          INTEGER PRIMARY KEY,
      book_id     INTEGER NOT NULL,
      number      INTEGER NOT NULL,
      verse_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE verse (
      id          INTEGER PRIMARY KEY,
      chapter_id  INTEGER NOT NULL,
      number      INTEGER NOT NULL,
      text        TEXT NOT NULL,
      text_plain  TEXT NOT NULL,
      lead        TEXT
    );
    -- The real schema declares verse_fts as an FTS5 contentless virtual
    -- table; for the fixture we use the same content=external pattern so
    -- snippet() works on inserted text.
    CREATE VIRTUAL TABLE verse_fts USING fts5(text_plain, content='verse', content_rowid='id');
  `);

  // Books — BSB Genesis (en_bsb has no apocrypha) plus WEB Tobit (lives in the
  // en_web fallback only). This is the exact pair findBook's fallback path
  // exists for.
  const insertBook = db.prepare(
    `INSERT INTO book (language, canon, slug, name, abbreviation, testament, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const bsbGenId = insertBook.run("en_bsb", "protestant", "gen", "Genesis", "Gen", "old", 1)
    .lastInsertRowid as number;
  insertBook.run("en_bsb", "protestant", "john", "John", "Jn", "new", 43);
  const webTobitId = insertBook.run("en_web", "deutero", "tob", "Tobit", "Tob", "deutero", 305)
    .lastInsertRowid as number;

  const insertChapter = db.prepare(
    `INSERT INTO chapter (book_id, number, verse_count) VALUES (?, ?, ?)`,
  );
  const bsbGenCh1Id = insertChapter.run(bsbGenId, 1, 3).lastInsertRowid as number;

  const insertVerse = db.prepare(
    `INSERT INTO verse (chapter_id, number, text, text_plain, lead) VALUES (?, ?, ?, ?, ?)`,
  );
  // Three Genesis 1 verses with distinct content so search snippets are
  // unambiguous.
  insertVerse.run(
    bsbGenCh1Id,
    1,
    "In the beginning God created the heavens and the earth.",
    "In the beginning God created the heavens and the earth.",
    "p",
  );
  insertVerse.run(
    bsbGenCh1Id,
    2,
    "Now the earth was formless and void.",
    "Now the earth was formless and void.",
    null,
  );
  insertVerse.run(
    bsbGenCh1Id,
    3,
    "And God said, 'Let there be light,' and there was light.",
    "And God said, Let there be light, and there was light.",
    null,
  );

  // verse_fts needs to be backfilled from verse since it's a content=external
  // FTS table. Mirrors the ingest pipeline's behavior — keep this in sync if
  // the real schema's FTS columns ever change.
  db.exec(
    `INSERT INTO verse_fts(rowid, text_plain) SELECT id, text_plain FROM verse`,
  );

  return { db, refs: { bsbGenId, webTobitId, bsbGenCh1Id } };
}
