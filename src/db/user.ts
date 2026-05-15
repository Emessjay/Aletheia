import Database from "@tauri-apps/plugin-sql";
import { nowMs } from "@/lib/time";
import { newId } from "@/lib/ulid";
import type {
  BookmarkRow,
  HighlightColor,
  HighlightRow,
  LibraryRow,
  NoteRow,
  VerseRef,
} from "./types";

const USER_DB_URL = "sqlite:aletheia_user.db";

let userPromise: Promise<Database> | null = null;

export function user(): Promise<Database> {
  if (!userPromise) {
    userPromise = Database.load(USER_DB_URL);
  }
  return userPromise;
}

export async function userSelect<T>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await user();
  return db.select<T[]>(sql, params);
}

export async function userExecute(
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  const db = await user();
  await db.execute(sql, params);
}

// ── Library ──────────────────────────────────────────────────────────────────

export async function listLibraries(): Promise<LibraryRow[]> {
  return userSelect<LibraryRow>(
    `SELECT * FROM libraries WHERE deleted_at IS NULL ORDER BY sort_order, name`,
  );
}

export async function createLibrary(name: string): Promise<LibraryRow> {
  const id = newId();
  const now = nowMs();
  await userExecute(
    `INSERT INTO libraries (id, name, sort_order, created_at, updated_at)
     VALUES ($1, $2, 0, $3, $3)`,
    [id, name, now],
  );
  return {
    id,
    name,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

export async function softDeleteLibrary(id: string): Promise<void> {
  const now = nowMs();
  await userExecute(
    `UPDATE libraries SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
    [now, id],
  );
}

// ── Highlights ───────────────────────────────────────────────────────────────

export async function listHighlightsForVerse(
  ref: VerseRef,
): Promise<HighlightRow[]> {
  return userSelect<HighlightRow>(
    `SELECT * FROM highlights
     WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3 AND verse = $4
       AND deleted_at IS NULL`,
    [ref.workSlug, ref.bookSlug, ref.chapter, ref.verse],
  );
}

export async function createHighlight(
  ref: VerseRef,
  color: HighlightColor,
  translation: string | null = null,
): Promise<HighlightRow> {
  const id = newId();
  const now = nowMs();
  await userExecute(
    `INSERT INTO highlights
       (id, work_slug, book_slug, chapter, verse, translation, color, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [
      id,
      ref.workSlug,
      ref.bookSlug,
      ref.chapter,
      ref.verse,
      translation,
      color,
      now,
    ],
  );
  return {
    id,
    work_slug: ref.workSlug,
    book_slug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
    translation,
    color,
    start_token: null,
    end_token: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

export async function softDeleteHighlight(id: string): Promise<void> {
  const now = nowMs();
  await userExecute(
    `UPDATE highlights SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
    [now, id],
  );
}

// ── Notes ────────────────────────────────────────────────────────────────────

export async function listNotesForVerse(ref: VerseRef): Promise<NoteRow[]> {
  return userSelect<NoteRow>(
    `SELECT * FROM notes
     WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3 AND verse = $4
       AND deleted_at IS NULL
     ORDER BY created_at`,
    [ref.workSlug, ref.bookSlug, ref.chapter, ref.verse],
  );
}

export async function upsertNote(
  ref: VerseRef,
  body: string,
): Promise<NoteRow> {
  const id = newId();
  const now = nowMs();
  await userExecute(
    `INSERT INTO notes
       (id, work_slug, book_slug, chapter, verse, body, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [id, ref.workSlug, ref.bookSlug, ref.chapter, ref.verse, body, now],
  );
  return {
    id,
    work_slug: ref.workSlug,
    book_slug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
    body,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function listBookmarks(libraryId: string): Promise<BookmarkRow[]> {
  return userSelect<BookmarkRow>(
    `SELECT * FROM bookmarks
     WHERE library_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [libraryId],
  );
}

export async function createBookmark(
  libraryId: string,
  ref: VerseRef,
  label: string | null = null,
): Promise<BookmarkRow> {
  const id = newId();
  const now = nowMs();
  await userExecute(
    `INSERT INTO bookmarks
       (id, library_id, work_slug, book_slug, chapter, verse, label, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [
      id,
      libraryId,
      ref.workSlug,
      ref.bookSlug,
      ref.chapter,
      ref.verse,
      label,
      now,
    ],
  );
  return {
    id,
    library_id: libraryId,
    work_slug: ref.workSlug,
    book_slug: ref.bookSlug ?? null,
    chapter: ref.chapter,
    verse: ref.verse,
    label,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

// ── KV ───────────────────────────────────────────────────────────────────────

export async function kvGet(key: string): Promise<string | null> {
  const rows = await userSelect<{ value: string }>(
    `SELECT value FROM kv WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function kvSet(key: string, value: string): Promise<void> {
  const now = nowMs();
  await userExecute(
    `INSERT INTO kv (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now],
  );
}
