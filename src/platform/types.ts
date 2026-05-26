// Platform-adapter interface definitions.
//
// Aletheia talks to its host environment (today: Tauri desktop; soon: a
// browser-deployable Railway build) through these adapters. Feature code
// imports from `@/platform` and never reaches `@tauri-apps/*` directly, so
// swapping in a web implementation is purely additive — write a parallel
// `src/platform/web/` directory and flip the selector in `getPlatform()`.

import type { AudioTranslation } from "@/domain/audio";
import type { PreferencesV1 } from "@/theme/types";
import type {
  BookmarkRow,
  HighlightColor,
  HighlightRow,
  LibraryRow,
  NoteRow,
} from "@/db/types";

/** Read-only SQL access to the bundled corpus database. */
export interface CorpusAdapter {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  selectOne<T>(sql: string, params?: unknown[]): Promise<T | null>;
}

// ── User-data typed adapter ──────────────────────────────────────────────
// Phase 3b moved the web build from sql.js-over-IndexedDB to a per-user
// REST API. Both hosts now speak this typed interface; the web adapter
// translates each method to an /api/user/* fetch (with Bearer JWT) and the
// Tauri adapter translates to plugin-sql against the local SQLite. Call
// sites do not see HTTP or SQL — only the typed shape.

export interface HighlightCreate {
  workSlug: string;
  bookSlug: string;
  chapter: number;
  verse: number;
  translation: string | null;
  color: HighlightColor;
  startToken: number | null;
  endToken: number | null;
  id?: string;
}

export interface NoteCreate {
  workSlug: string;
  bookSlug: string;
  chapter: number;
  verse: number;
  body: string;
  id?: string;
}

export interface BookmarkCreate {
  libraryId: string;
  workSlug: string;
  bookSlug: string | null;
  chapter: number | null;
  verse: number | null;
  translation: string | null;
  label: string | null;
  id?: string;
}

export interface LibraryCreate {
  name: string;
  sortOrder?: number;
  id?: string;
}

export interface VerseRefArg {
  workSlug: string;
  bookSlug: string;
  chapter: number;
  verse: number;
}

export interface ChapterRefArg {
  workSlug: string;
  bookSlug: string;
  chapter: number;
}

export interface ChapterAnnotationsResult {
  highlights: HighlightRow[];
  notes: NoteRow[];
}

export interface LibrariesAdapter {
  list(): Promise<LibraryRow[]>;
  create(input: LibraryCreate): Promise<LibraryRow>;
  softDelete(id: string): Promise<void>;
}

export interface HighlightsAdapter {
  listForVerse(
    input: VerseRefArg & { translation?: string | null },
  ): Promise<HighlightRow[]>;
  listForChapter(input: ChapterRefArg): Promise<HighlightRow[]>;
  create(input: HighlightCreate): Promise<HighlightRow>;
  softDelete(id: string): Promise<void>;
}

export interface NotesAdapter {
  listForVerse(input: VerseRefArg): Promise<NoteRow[]>;
  create(input: NoteCreate): Promise<NoteRow>;
  update(id: string, input: { body: string }): Promise<NoteRow>;
  softDelete(id: string): Promise<void>;
}

export interface BookmarksAdapter {
  listForLibrary(libraryId: string): Promise<BookmarkRow[]>;
  create(input: BookmarkCreate): Promise<BookmarkRow>;
  softDelete(id: string): Promise<void>;
}

export interface AnnotationsAdapter {
  forChapter(input: ChapterRefArg): Promise<ChapterAnnotationsResult>;
}

export interface KvAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface UserDataAdapter {
  libraries: LibrariesAdapter;
  highlights: HighlightsAdapter;
  notes: NotesAdapter;
  bookmarks: BookmarksAdapter;
  annotations: AnnotationsAdapter;
  kv: KvAdapter;
}

/** Result of resolving an audio source file's absolute path. */
export interface AudioSourcePath {
  path: string;
  exists: boolean;
}

/** Audio source-file resolution and download. The webview-playable URL is
 *  also a per-platform concern: Tauri uses `asset://`, the web build will
 *  use blob/HTTP. */
export interface AudioAdapter {
  sourcePath(
    translation: AudioTranslation,
    bookSlug: string,
    filename: string,
  ): Promise<AudioSourcePath>;
  bookSourcesPresent(
    translation: AudioTranslation,
    bookSlug: string,
  ): Promise<string[]>;
  downloadSource(
    translation: AudioTranslation,
    bookSlug: string,
    url: string,
    filename: string,
  ): Promise<string>;
  /** Turn an absolute path returned by `sourcePath` into a URL the webview
   *  can play. Synchronous because it's a pure string transform. */
  assetUrl(absolutePath: string): string;
}

/** Durable user-preferences blob. Today a single JSON file (theme overrides);
 *  the surface is intentionally minimal so the web build can back it with
 *  localStorage without re-implementing a filesystem. */
export interface PreferencesAdapter {
  read(): Promise<PreferencesV1 | null>;
  write(prefs: PreferencesV1): Promise<void>;
}

/** Static facts about the host environment. Evaluated once per process. */
export interface PlatformInfo {
  /** True when running inside a desktop shell (Tauri today). */
  isDesktop: boolean;
  isMacDesktop: boolean;
  isWindowsDesktop: boolean;
  isIOSDesktop: boolean;
}

export interface Platform {
  corpus: CorpusAdapter;
  userData: UserDataAdapter;
  audio: AudioAdapter;
  preferences: PreferencesAdapter;
  info: PlatformInfo;
}
