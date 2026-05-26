// Tauri implementation of UserDataAdapter.
//
// Desktop builds stay local-first: every typed adapter method translates to
// SQL run against the bundled SQLite user database via tauri-plugin-sql.
// There is no Supabase, no JWT, no HTTP. The SQL strings here are the
// canonical local-first shape — phase 3a's Postgres endpoints expose the
// same logical contract for web. ULIDs and timestamps are generated
// client-side, matching the pre-3b behavior so existing rows stay valid.

import Database from "@tauri-apps/plugin-sql";
import { nowMs } from "@/lib/time";
import { newId } from "@/lib/ulid";
import type {
  BookmarkCreate,
  BookmarksAdapter,
  ChapterAnnotationsResult,
  ChapterRefArg,
  HighlightCreate,
  HighlightsAdapter,
  KvAdapter,
  LibrariesAdapter,
  LibraryCreate,
  NoteCreate,
  NotesAdapter,
  UserDataAdapter,
  VerseRefArg,
} from "../types";
import type {
  BookmarkRow,
  HighlightRow,
  LibraryRow,
  NoteRow,
} from "@/db/types";

const USER_DB_URL = "sqlite:aletheia_user.db";

let userPromise: Promise<Database> | null = null;
function userDb(): Promise<Database> {
  if (!userPromise) {
    userPromise = Database.load(USER_DB_URL);
  }
  return userPromise;
}

async function dbSelect<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await userDb();
  return db.select<T[]>(sql, params);
}

async function dbExecute(sql: string, params: unknown[] = []): Promise<void> {
  const db = await userDb();
  await db.execute(sql, params);
}

// ── Libraries ────────────────────────────────────────────────────────────

const libraries: LibrariesAdapter = {
  async list(): Promise<LibraryRow[]> {
    return dbSelect<LibraryRow>(
      `SELECT * FROM libraries WHERE deleted_at IS NULL ORDER BY sort_order, name`,
    );
  },
  async create(input: LibraryCreate): Promise<LibraryRow> {
    const id = input.id ?? newId();
    const now = nowMs();
    const sortOrder = input.sortOrder ?? 0;
    await dbExecute(
      `INSERT INTO libraries (id, name, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [id, input.name, sortOrder, now],
    );
    return {
      id,
      name: input.name,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  async softDelete(id: string): Promise<void> {
    const now = nowMs();
    await dbExecute(
      `UPDATE libraries SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  },
};

// ── Highlights ───────────────────────────────────────────────────────────

const highlights: HighlightsAdapter = {
  async listForVerse(input): Promise<HighlightRow[]> {
    // Mirror the web endpoint's "universal rows show on every side" rule.
    // translation === "en_modern" → match en_modern OR NULL.
    // translation === null/undefined → match only NULL rows.
    // anything else → exact match.
    if (input.translation === "en_modern") {
      return dbSelect<HighlightRow>(
        `SELECT * FROM highlights
         WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3 AND verse = $4
           AND (translation = $5 OR translation IS NULL)
           AND deleted_at IS NULL
         ORDER BY created_at`,
        [input.workSlug, input.bookSlug, input.chapter, input.verse, "en_modern"],
      );
    }
    if (input.translation === undefined || input.translation === null) {
      return dbSelect<HighlightRow>(
        `SELECT * FROM highlights
         WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3 AND verse = $4
           AND translation IS NULL
           AND deleted_at IS NULL
         ORDER BY created_at`,
        [input.workSlug, input.bookSlug, input.chapter, input.verse],
      );
    }
    return dbSelect<HighlightRow>(
      `SELECT * FROM highlights
       WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3 AND verse = $4
         AND translation = $5
         AND deleted_at IS NULL
       ORDER BY created_at`,
      [input.workSlug, input.bookSlug, input.chapter, input.verse, input.translation],
    );
  },
  async listForChapter(input: ChapterRefArg): Promise<HighlightRow[]> {
    return dbSelect<HighlightRow>(
      `SELECT * FROM highlights
       WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3
         AND deleted_at IS NULL
       ORDER BY verse, created_at`,
      [input.workSlug, input.bookSlug, input.chapter],
    );
  },
  async create(input: HighlightCreate): Promise<HighlightRow> {
    const id = input.id ?? newId();
    const now = nowMs();
    await dbExecute(
      `INSERT INTO highlights
         (id, work_slug, book_slug, chapter, verse, translation, color,
          start_token, end_token, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [
        id,
        input.workSlug,
        input.bookSlug,
        input.chapter,
        input.verse,
        input.translation,
        input.color,
        input.startToken,
        input.endToken,
        now,
      ],
    );
    return {
      id,
      work_slug: input.workSlug,
      book_slug: input.bookSlug,
      chapter: input.chapter,
      verse: input.verse,
      translation: input.translation,
      color: input.color,
      start_token: input.startToken,
      end_token: input.endToken,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  async softDelete(id: string): Promise<void> {
    const now = nowMs();
    await dbExecute(
      `UPDATE highlights SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  },
};

// ── Notes ────────────────────────────────────────────────────────────────

const notes: NotesAdapter = {
  async listForVerse(input: VerseRefArg): Promise<NoteRow[]> {
    return dbSelect<NoteRow>(
      `SELECT * FROM notes
       WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3 AND verse = $4
         AND deleted_at IS NULL
       ORDER BY created_at`,
      [input.workSlug, input.bookSlug, input.chapter, input.verse],
    );
  },
  async create(input: NoteCreate): Promise<NoteRow> {
    const id = input.id ?? newId();
    const now = nowMs();
    await dbExecute(
      `INSERT INTO notes
         (id, work_slug, book_slug, chapter, verse, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [id, input.workSlug, input.bookSlug, input.chapter, input.verse, input.body, now],
    );
    return {
      id,
      work_slug: input.workSlug,
      book_slug: input.bookSlug,
      chapter: input.chapter,
      verse: input.verse,
      body: input.body,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  async update(id: string, input: { body: string }): Promise<NoteRow> {
    const now = nowMs();
    await dbExecute(
      `UPDATE notes SET body = $1, updated_at = $2 WHERE id = $3`,
      [input.body, now, id],
    );
    const rows = await dbSelect<NoteRow>(
      `SELECT * FROM notes WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new Error(`notes.update: row ${id} not found`);
    return row;
  },
  async softDelete(id: string): Promise<void> {
    const now = nowMs();
    await dbExecute(
      `UPDATE notes SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  },
};

// ── Bookmarks ────────────────────────────────────────────────────────────

const bookmarks: BookmarksAdapter = {
  async listForLibrary(libraryId: string): Promise<BookmarkRow[]> {
    return dbSelect<BookmarkRow>(
      `SELECT * FROM bookmarks
       WHERE library_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [libraryId],
    );
  },
  async create(input: BookmarkCreate): Promise<BookmarkRow> {
    const id = input.id ?? newId();
    const now = nowMs();
    await dbExecute(
      `INSERT INTO bookmarks
         (id, library_id, work_slug, book_slug, chapter, verse, translation, label, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)`,
      [
        id,
        input.libraryId,
        input.workSlug,
        input.bookSlug,
        input.chapter,
        input.verse,
        input.translation,
        input.label,
        now,
      ],
    );
    return {
      id,
      library_id: input.libraryId,
      work_slug: input.workSlug,
      book_slug: input.bookSlug,
      chapter: input.chapter,
      verse: input.verse,
      translation: input.translation,
      label: input.label,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  },
  async softDelete(id: string): Promise<void> {
    const now = nowMs();
    await dbExecute(
      `UPDATE bookmarks SET deleted_at = $1, updated_at = $1 WHERE id = $2`,
      [now, id],
    );
  },
};

// ── Annotations (chapter combined) ───────────────────────────────────────

const annotations = {
  async forChapter(input: ChapterRefArg): Promise<ChapterAnnotationsResult> {
    const [hls, nts] = await Promise.all([
      highlights.listForChapter(input),
      dbSelect<NoteRow>(
        `SELECT * FROM notes
         WHERE work_slug = $1 AND book_slug = $2 AND chapter = $3
           AND deleted_at IS NULL
         ORDER BY verse, created_at`,
        [input.workSlug, input.bookSlug, input.chapter],
      ),
    ]);
    return { highlights: hls, notes: nts };
  },
};

// ── KV ───────────────────────────────────────────────────────────────────

const kv: KvAdapter = {
  async get(key: string): Promise<string | null> {
    const rows = await dbSelect<{ value: string }>(
      `SELECT value FROM kv WHERE key = $1`,
      [key],
    );
    return rows[0]?.value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    const now = nowMs();
    await dbExecute(
      `INSERT INTO kv (key, value, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, now],
    );
  },
};

export const tauriUserData: UserDataAdapter = {
  libraries,
  highlights,
  notes,
  bookmarks,
  annotations,
  kv,
};
