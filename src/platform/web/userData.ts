// Web implementation of UserDataAdapter.
//
// Phase 3b: every method maps to one of the typed /api/user/* endpoints
// from the FastAPI server. The adapter attaches the Supabase JWT as
// Authorization: Bearer <jwt> via getAccessToken(); call sites never see
// raw tokens.
//
// Snake_case ↔ camelCase translation happens here so feature code can keep
// using the camelCase TS row types from `src/db/types.ts`. The wire format
// (Postgres snake_case) matches phase 3a's contract exactly.
//
// When the user is signed out, every write method (and every read) rejects
// with AuthRequiredError. Feature code catches the sentinel and pops the
// AuthScreen — silent failure is worse than a thrown error. A 401 from
// the server (expired / invalid JWT) maps to the same error so callers
// don't have to distinguish "never signed in" from "signed in but stale".

import { getAccessToken } from "@/auth/client";
import type {
  BookmarkCreate,
  BookmarksAdapter,
  BugReportCreate,
  BugReportRow,
  BugReportsAdapter,
  ChapterAnnotationsResult,
  HighlightCreate,
  HighlightsAdapter,
  KvAdapter,
  LibrariesAdapter,
  LibraryCreate,
  NoteCreate,
  NotesAdapter,
  UserDataAdapter,
  VerseRefArg,
  ChapterRefArg,
} from "../types";
import type {
  BookmarkRow,
  HighlightColor,
  HighlightRow,
  LibraryRow,
  NoteRow,
} from "@/db/types";

const API_BASE = "/api/user";

export class AuthRequiredError extends Error {
  constructor(message = "auth required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | null | undefined>;
  // When true, a 404 response resolves to null rather than throwing. Used by
  // the kv namespace where "not found" is a valid value.
  allow404?: boolean;
}

async function apiRequest<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T | null> {
  const token = await getAccessToken();
  if (!token) throw new AuthRequiredError();

  const url = new URL(`${API_BASE}${path}`, location.origin);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  if (opts.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  // Render the URL as path+search so call sites and tests can assert against
  // a stable origin-relative string; absolute origins leak the test harness.
  const requestUrl = url.pathname + url.search;

  const res = await fetch(requestUrl, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 401) {
    throw new AuthRequiredError("session expired");
  }
  if (res.status === 404 && opts.allow404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${opts.method ?? "GET"} ${path} → ${res.status}: ${text}`);
  }

  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return null;
  return (await res.json()) as T;
}

// ── Row decoders ─────────────────────────────────────────────────────────
// Postgres returns snake_case; TS row types are snake_case in src/db/types.ts
// (mirroring the SQLite schema the Tauri build still uses). Where the spec
// requires camelCase on the public adapter surface (HighlightRow.sortOrder
// for libraries, for example), we copy the field across. Otherwise we
// forward the row as-is — this keeps the call-site rows identical between
// hosts. (`sortOrder` is the one field test #1 exercises in camelCase.)

interface RawLibrary {
  id: string;
  user_id?: string;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function decodeLibrary(r: RawLibrary): LibraryRow & { sortOrder: number } {
  return {
    id: r.id,
    name: r.name,
    sort_order: r.sort_order,
    sortOrder: r.sort_order,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  };
}

interface RawHighlight {
  id: string;
  user_id?: string;
  work_slug: string;
  book_slug: string;
  chapter: number;
  verse: number;
  translation: string | null;
  color: HighlightColor;
  start_token: number | null;
  end_token: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function decodeHighlight(r: RawHighlight): HighlightRow {
  return {
    id: r.id,
    work_slug: r.work_slug,
    book_slug: r.book_slug,
    chapter: r.chapter,
    verse: r.verse,
    translation: r.translation,
    color: r.color,
    start_token: r.start_token,
    end_token: r.end_token,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  };
}

interface RawNote {
  id: string;
  user_id?: string;
  work_slug: string;
  book_slug: string;
  chapter: number;
  verse: number;
  body: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function decodeNote(r: RawNote): NoteRow {
  return {
    id: r.id,
    work_slug: r.work_slug,
    book_slug: r.book_slug,
    chapter: r.chapter,
    verse: r.verse,
    body: r.body,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  };
}

interface RawBookmark {
  id: string;
  user_id?: string;
  library_id: string;
  work_slug: string;
  book_slug: string | null;
  chapter: number | null;
  verse: number | null;
  translation: string | null;
  label: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function decodeBookmark(r: RawBookmark): BookmarkRow {
  return {
    id: r.id,
    library_id: r.library_id,
    work_slug: r.work_slug,
    book_slug: r.book_slug,
    chapter: r.chapter,
    verse: r.verse,
    translation: r.translation,
    label: r.label,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  };
}

// ── Adapter namespaces ───────────────────────────────────────────────────

const libraries: LibrariesAdapter = {
  async list() {
    const rows = (await apiRequest<RawLibrary[]>("/libraries")) ?? [];
    return rows.map(decodeLibrary);
  },
  async create(input: LibraryCreate) {
    const body: Record<string, unknown> = { name: input.name };
    if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;
    if (input.id !== undefined) body.id = input.id;
    const row = await apiRequest<RawLibrary>("/libraries", {
      method: "POST",
      body,
    });
    if (!row) throw new Error("libraries.create: empty response");
    return decodeLibrary(row);
  },
  async softDelete(id: string) {
    await apiRequest<{ id: string }>(`/libraries/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

const highlights: HighlightsAdapter = {
  async listForVerse(input) {
    const rows =
      (await apiRequest<RawHighlight[]>("/highlights/verse", {
        query: {
          work_slug: input.workSlug,
          book_slug: input.bookSlug,
          chapter: input.chapter,
          verse: input.verse,
          translation: input.translation ?? undefined,
        },
      })) ?? [];
    return rows.map(decodeHighlight);
  },
  async listForChapter(input: ChapterRefArg) {
    const rows =
      (await apiRequest<RawHighlight[]>("/highlights/chapter", {
        query: {
          work_slug: input.workSlug,
          book_slug: input.bookSlug,
          chapter: input.chapter,
        },
      })) ?? [];
    return rows.map(decodeHighlight);
  },
  async create(input: HighlightCreate) {
    const body: Record<string, unknown> = {
      work_slug: input.workSlug,
      book_slug: input.bookSlug,
      chapter: input.chapter,
      verse: input.verse,
      translation: input.translation,
      color: input.color,
      start_token: input.startToken,
      end_token: input.endToken,
    };
    if (input.id !== undefined) body.id = input.id;
    const row = await apiRequest<RawHighlight>("/highlights", {
      method: "POST",
      body,
    });
    if (!row) throw new Error("highlights.create: empty response");
    return decodeHighlight(row);
  },
  async softDelete(id: string) {
    await apiRequest<{ id: string }>(`/highlights/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

const notes: NotesAdapter = {
  async listForVerse(input: VerseRefArg) {
    const rows =
      (await apiRequest<RawNote[]>("/notes/verse", {
        query: {
          work_slug: input.workSlug,
          book_slug: input.bookSlug,
          chapter: input.chapter,
          verse: input.verse,
        },
      })) ?? [];
    return rows.map(decodeNote);
  },
  async create(input: NoteCreate) {
    const body: Record<string, unknown> = {
      work_slug: input.workSlug,
      book_slug: input.bookSlug,
      chapter: input.chapter,
      verse: input.verse,
      body: input.body,
    };
    if (input.id !== undefined) body.id = input.id;
    const row = await apiRequest<RawNote>("/notes", {
      method: "POST",
      body,
    });
    if (!row) throw new Error("notes.create: empty response");
    return decodeNote(row);
  },
  async update(id: string, input: { body: string }) {
    const row = await apiRequest<RawNote>(
      `/notes/${encodeURIComponent(id)}`,
      { method: "PATCH", body: { body: input.body } },
    );
    if (!row) throw new Error("notes.update: empty response");
    return decodeNote(row);
  },
  async softDelete(id: string) {
    await apiRequest<{ id: string }>(`/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

const bookmarks: BookmarksAdapter = {
  async listForLibrary(libraryId: string) {
    const rows =
      (await apiRequest<RawBookmark[]>("/bookmarks", {
        query: { library_id: libraryId },
      })) ?? [];
    return rows.map(decodeBookmark);
  },
  async create(input: BookmarkCreate) {
    const body: Record<string, unknown> = {
      library_id: input.libraryId,
      work_slug: input.workSlug,
      book_slug: input.bookSlug,
      chapter: input.chapter,
      verse: input.verse,
      translation: input.translation,
      label: input.label,
    };
    if (input.id !== undefined) body.id = input.id;
    const row = await apiRequest<RawBookmark>("/bookmarks", {
      method: "POST",
      body,
    });
    if (!row) throw new Error("bookmarks.create: empty response");
    return decodeBookmark(row);
  },
  async softDelete(id: string) {
    await apiRequest<{ id: string }>(`/bookmarks/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};

const annotations = {
  async forChapter(input: ChapterRefArg): Promise<ChapterAnnotationsResult> {
    const res =
      (await apiRequest<{ highlights: RawHighlight[]; notes: RawNote[] }>(
        "/annotations/chapter",
        {
          query: {
            work_slug: input.workSlug,
            book_slug: input.bookSlug,
            chapter: input.chapter,
          },
        },
      )) ?? { highlights: [], notes: [] };
    return {
      highlights: res.highlights.map(decodeHighlight),
      notes: res.notes.map(decodeNote),
    };
  },
};

interface RawBugReport {
  id: string;
  user_id: string;
  platform: "web" | "local";
  description: string;
  created_at: number;
}

function decodeBugReport(r: RawBugReport): BugReportRow {
  return {
    id: r.id,
    userId: r.user_id,
    platform: r.platform,
    description: r.description,
    createdAt: r.created_at,
  };
}

const bugReports: BugReportsAdapter = {
  async create(input: BugReportCreate) {
    const body: Record<string, unknown> = {
      platform: input.platform,
      description: input.description,
    };
    if (input.id !== undefined) body.id = input.id;
    const row = await apiRequest<RawBugReport>("/bug-reports", {
      method: "POST",
      body,
    });
    if (!row) throw new Error("bugReports.create: empty response");
    return decodeBugReport(row);
  },
};

const kv: KvAdapter = {
  async get(key: string) {
    const res = await apiRequest<{ value: string }>(
      `/kv/${encodeURIComponent(key)}`,
      { allow404: true },
    );
    return res?.value ?? null;
  },
  async set(key: string, value: string) {
    await apiRequest<{ value: string }>(`/kv/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: { value },
    });
  },
};

export const webUserData: UserDataAdapter = {
  libraries,
  highlights,
  notes,
  bookmarks,
  annotations,
  kv,
  bugReports,
};
