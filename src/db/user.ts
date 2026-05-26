// User-data CRUD helpers — thin wrappers around the platform's typed
// UserDataAdapter. Phase 3b moved the SQL strings out of this module and
// into each adapter (Tauri keeps SQLite via plugin-sql; web speaks to the
// FastAPI /api/user/* endpoints with a Supabase JWT). This file stays as
// the stable import surface for feature code — same function signatures,
// same row shapes, no SQL leaking up.

import { getPlatform } from "@/platform";
import type {
  BookmarkRow,
  HighlightColor,
  HighlightRow,
  LibraryRow,
  NoteRow,
  VerseRef,
} from "./types";

export interface ChapterAnnotations {
  highlights: HighlightRow[];
  notes: NoteRow[];
}

function ud() {
  return getPlatform().userData;
}

// ── Library ──────────────────────────────────────────────────────────────────

export function listLibraries(): Promise<LibraryRow[]> {
  return ud().libraries.list();
}

export function createLibrary(name: string): Promise<LibraryRow> {
  return ud().libraries.create({ name });
}

export function softDeleteLibrary(id: string): Promise<void> {
  return ud().libraries.softDelete(id);
}

// ── Highlights ───────────────────────────────────────────────────────────────

export interface HighlightRange {
  /** Character offset into VerseRow.text_plain (inclusive). */
  startToken: number;
  /** Character offset into VerseRow.text_plain (exclusive). */
  endToken: number;
}

export function listHighlightsForVerse(ref: VerseRef): Promise<HighlightRow[]> {
  return ud().highlights.listForVerse({
    workSlug: ref.workSlug,
    bookSlug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
  });
}

export function createHighlight(
  ref: VerseRef,
  color: HighlightColor,
  translation: string | null = null,
  range: HighlightRange | null = null,
): Promise<HighlightRow> {
  return ud().highlights.create({
    workSlug: ref.workSlug,
    bookSlug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
    translation,
    color,
    startToken: range?.startToken ?? null,
    endToken: range?.endToken ?? null,
  });
}

export function softDeleteHighlight(id: string): Promise<void> {
  return ud().highlights.softDelete(id);
}

export function listChapterAnnotations(
  workSlug: string,
  bookSlug: string,
  chapter: number,
): Promise<ChapterAnnotations> {
  return ud().annotations.forChapter({ workSlug, bookSlug, chapter });
}

// ── Notes ────────────────────────────────────────────────────────────────────

export function listNotesForVerse(ref: VerseRef): Promise<NoteRow[]> {
  return ud().notes.listForVerse({
    workSlug: ref.workSlug,
    bookSlug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
  });
}

export function createNote(ref: VerseRef, body: string): Promise<NoteRow> {
  return ud().notes.create({
    workSlug: ref.workSlug,
    bookSlug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
    body,
  });
}

export async function updateNote(id: string, body: string): Promise<void> {
  await ud().notes.update(id, { body });
}

export function softDeleteNote(id: string): Promise<void> {
  return ud().notes.softDelete(id);
}

// ── Bookmarks ────────────────────────────────────────────────────────────────

export function listBookmarks(libraryId: string): Promise<BookmarkRow[]> {
  return ud().bookmarks.listForLibrary(libraryId);
}

export function createBookmark(
  libraryId: string,
  ref: VerseRef,
  translation: string | null = null,
  label: string | null = null,
): Promise<BookmarkRow> {
  return ud().bookmarks.create({
    libraryId,
    workSlug: ref.workSlug,
    bookSlug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
    translation,
    label,
  });
}

export function softDeleteBookmark(id: string): Promise<void> {
  return ud().bookmarks.softDelete(id);
}

// ── KV ───────────────────────────────────────────────────────────────────────

export function kvGet(key: string): Promise<string | null> {
  return ud().kv.get(key);
}

export function kvSet(key: string, value: string): Promise<void> {
  return ud().kv.set(key, value);
}
