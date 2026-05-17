// Corpus (read-only) row types — mirror data/Aletheia.sqlite schema.

export type CorpusLanguage =
  | "he"
  | "gk"
  | "en_bsb"
  | "en_kjv"
  | "en_brenton"
  | "en_web"
  | "la";

export type Testament = "old" | "deutero" | "new";
export type Canon = "protestant" | "deutero";

export interface BookRow {
  id: number;
  language: CorpusLanguage;
  canon: Canon;
  slug: string;
  name: string;
  abbreviation: string;
  testament: Testament;
  order_index: number;
}

export interface ChapterRow {
  id: number;
  book_id: number;
  number: number;
  verse_count: number;
}

export interface VerseRow {
  id: number;
  chapter_id: number;
  number: number;
  text: string;
  text_plain: string;
  /**
   * USFM line marker that introduced this verse in the source, when present.
   * `'p'`/`'m'`/`'nb'`/`'pi*'` are prose paragraphs; `'q1'`/`'q2'`/`'q3'` are
   * poetic indent levels; `'b'` is a stanza break. `null` means the verse
   * continues the previous verse's paragraph inline (or the source has no
   * paragraph markup, as with BSB). Only used by the single-language reader
   * layout — parallel/multi-column views ignore it for grid alignment.
   */
  lead: string | null;
}

export type WordBaseText = "NA28" | "BYZ" | "TR" | "LXX" | null;

export interface WordRow {
  id: number;
  verse_id: number;
  position: number;
  surface: string;
  lemma: string | null;
  strongs: string | null;
  morphology: string | null;
  base_text: WordBaseText;
  // BSB-derived per-word English translation (from STEPBible TAHOT/TAGNT col 3).
  // Present for he + gk-NT word rows; null for LXX tokens and any others.
  english: string | null;
}

export interface StrongsRow {
  id: string; // "H1234" | "G5678"
  language: "he" | "gk";
  lemma: string;
  transliteration: string | null;
  gloss: string;
  definition: string;
  kjv_usage: string | null;
}

export interface XrefRow {
  id: number;
  from_verse_id: number;
  to_verse_start: number;
  to_verse_end: number | null;
  weight: number;
}

// Stable, value-type pointer into the corpus that survives DB rebuilds.
// Mirrors VerseRef from the old SwiftUI app.
export interface VerseRef {
  workSlug: string; // "bible"
  bookSlug: string; // "gen" | "john" | "1mac"
  chapter: number;
  verse: number;
}

export function verseRefKey(r: VerseRef): string {
  return `${r.workSlug}:${r.bookSlug}:${r.chapter}:${r.verse}`;
}

// User DB (read-write) row types — mirror src/db/schema.sql.

export type HighlightColor =
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "purple"
  | "orange";

export interface LibraryRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface BookmarkRow {
  id: string;
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

export interface HighlightRow {
  id: string;
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

export interface NoteRow {
  id: string;
  work_slug: string;
  book_slug: string;
  chapter: number;
  verse: number;
  body: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface KvRow {
  key: string;
  value: string;
  updated_at: number;
}
