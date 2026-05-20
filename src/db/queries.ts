import { corpusSelect, corpusSelectOne } from "./corpus";
import type {
  BookRow,
  ChapterRow,
  CitationRow,
  CorpusLanguage,
  SectionLanguage,
  SectionOutlineRow,
  SectionRow,
  StrongsRow,
  VerseRow,
  WordRow,
  WorkRow,
  XrefRow,
} from "./types";
import {
  getMTSegments,
  isLXXVersified,
  type MTSegment,
} from "@/domain/versification";

// ── Commentaries (work/section) ───────────────────────────────────────────
//
// Commentaries are stored under the existing `work` / `section` tables with
//   work.kind = 'commentary'
//   section.ordinal_path =
//     "<work>.<book>"          for book-kind rows
//     "<work>.<book>.<ch>"     for chapter-kind rows
//     "<work>.<book>.<ch>.<n>" for comment-kind rows
// Every commentary always has a book + chapter row for each (book, chapter)
// it covers, even when the source text has no introductory blurb at that
// level — that way the picker can iterate `kind='book'` / `kind='chapter'`
// rows directly without parsing ordinal_path strings.

/** All commentaries, ordered by id (== ingest order). */
export async function listCommentaries(): Promise<WorkRow[]> {
  return corpusSelect<WorkRow>(
    `SELECT * FROM work WHERE kind = 'commentary' ORDER BY id`,
  );
}

/** Book-kind sections for a commentary, joined to the canonical book table
 *  so the UI can sort and label them by the same order_index used in Reader. */
export interface CommentaryBookEntry {
  ordinal_path: string;
  section_id: number;
  book_slug: string;
  book_name: string;
  order_index: number;
}

export async function listCommentaryBooks(
  workSlug: string,
): Promise<CommentaryBookEntry[]> {
  return corpusSelect<CommentaryBookEntry>(
    `SELECT s.ordinal_path AS ordinal_path,
            s.id           AS section_id,
            COALESCE(s.label, '') AS book_slug,
            COALESCE(b.name, s.label, '?') AS book_name,
            COALESCE(b.order_index, 999) AS order_index
       FROM section s
       JOIN work w ON w.id = s.work_id
       LEFT JOIN book b
         ON b.slug = s.label AND b.language = 'en_bsb'
      WHERE w.slug = $1 AND s.kind = 'book'
      ORDER BY order_index, s.label`,
    [workSlug],
  );
}

/** The book-kind section's body for a (commentary, book), if any. Holds
 *  the SWORD-anchored front matter (title page, translator's preface, etc.)
 *  when the ingest detected it; empty string when there's no intro. */
export async function getCommentaryBookIntro(
  workSlug: string,
  bookSlug: string,
): Promise<string> {
  const row = await corpusSelectOne<{ body: string }>(
    `SELECT s.body FROM section s
       JOIN work w ON w.id = s.work_id
      WHERE w.slug = $1 AND s.kind = 'book' AND s.label = $2
      LIMIT 1`,
    [workSlug, bookSlug],
  );
  return row?.body ?? "";
}

/** Chapter-kind sections for a (commentary, book). `label` on a chapter row
 *  is the chapter number as a string ("1", "2", ...). Ordering relies on the
 *  ingest having written rows in chapter-number order. */
export async function listCommentaryChapters(
  workSlug: string,
  bookSlug: string,
): Promise<SectionRow[]> {
  // ordinal_path is exactly "<work>.<book>.<ch>" — two dots deep.
  // Excluding deeper paths keeps the result to chapter rows only.
  return corpusSelect<SectionRow>(
    `SELECT s.* FROM section s
       JOIN work w ON w.id = s.work_id
      WHERE w.slug = $1
        AND s.kind = 'chapter'
        AND s.ordinal_path LIKE $1 || '.' || $2 || '.%'
        AND s.ordinal_path NOT LIKE $1 || '.' || $2 || '.%.%'
      ORDER BY s.ordering`,
    [workSlug, bookSlug],
  );
}

/** All comment-kind sections for a (commentary, book, chapter), plus the
 *  chapter intro (kind='chapter') itself if it has a body. Returned in
 *  document order.
 *
 *  Note: tauri-plugin-sql binds JS numbers as f64, so passing `1` lands in
 *  SQLite as `1.0` and `'gen.' || 1.0` evaluates to `'gen.1.0'` — never
 *  matching the `'calvin.gen.1.001'` ordinal_path. Stringify on the JS side
 *  so the parameter arrives as TEXT and concatenates cleanly. */
export async function listChapterCommentary(
  workSlug: string,
  bookSlug: string,
  chapter: number,
): Promise<SectionRow[]> {
  const chapterStr = String(chapter);
  return corpusSelect<SectionRow>(
    `SELECT s.* FROM section s
       JOIN work w ON w.id = s.work_id
      WHERE w.slug = $1
        AND (
          s.ordinal_path = $1 || '.' || $2 || '.' || $3
          OR s.ordinal_path LIKE $1 || '.' || $2 || '.' || $3 || '.%'
        )
      ORDER BY s.ordering`,
    [workSlug, bookSlug, chapterStr],
  );
}

// ── Patristic works (Summa, NPNF treatises) ───────────────────────────────
//
// Patristics share the work/section/citation tables with commentaries but use
// a different shape:
//   • `work.kind` is one of 'summa' | 'dialogue' | 'treatise' (everything but
//     'commentary').
//   • Sections form a tree via `parent_id`; `ordinal_path` is the dotted
//     navigation key (e.g. "summa.1.Q1.A1.respondeo" or "incarnation.32").
//   • `section.language` ranges across 'en' | 'gr' | 'la' — the same logical
//     section may exist in multiple languages and is joined on ordinal_path.
export type PatristicLanguage = SectionLanguage;

export async function listPatristicWorks(): Promise<WorkRow[]> {
  return corpusSelect<WorkRow>(
    `SELECT * FROM work WHERE kind != 'commentary' ORDER BY id`,
  );
}

/** Outline rows for a patristic work — id/path/kind/label/ordering, no body.
 *  Used for the sidebar TOC, prev/next nav, and the work-redirect first-row
 *  lookup. Dropping `body` keeps the response well under the server's 5 MiB
 *  cap even for the Summa (~6000 sections). */
export async function listSectionOutline(
  workSlug: string,
  language: PatristicLanguage,
): Promise<SectionOutlineRow[]> {
  return corpusSelect<SectionOutlineRow>(
    `SELECT s.id, s.work_id, s.parent_id, s.ordinal_path, s.kind,
            s.label, s.language, s.ordering
       FROM section s
       JOIN work w ON w.id = s.work_id
      WHERE w.slug = $1 AND s.language = $2
      ORDER BY s.ordering`,
    [workSlug, language],
  );
}

/** A section by ordinal_path. Falls back across languages so the route still
 *  renders if the requested language is missing for this section. */
export async function getSection(
  workSlug: string,
  ordinalPath: string,
  language: PatristicLanguage,
): Promise<SectionRow | null> {
  const direct = await corpusSelectOne<SectionRow>(
    `SELECT s.* FROM section s
       JOIN work w ON w.id = s.work_id
      WHERE w.slug = $1 AND s.ordinal_path = $2 AND s.language = $3`,
    [workSlug, ordinalPath, language],
  );
  if (direct) return direct;
  return corpusSelectOne<SectionRow>(
    `SELECT s.* FROM section s
       JOIN work w ON w.id = s.work_id
      WHERE w.slug = $1 AND s.ordinal_path = $2
      ORDER BY CASE s.language WHEN 'en' THEN 0 WHEN 'la' THEN 1 ELSE 2 END
      LIMIT 1`,
    [workSlug, ordinalPath],
  );
}

/** Direct children of a section (one level deep) — used for Summa article
 *  bundles where one URL displays the question/article and its sub-sections. */
export async function listChildSections(
  workSlug: string,
  parentPath: string,
  language: PatristicLanguage,
): Promise<SectionRow[]> {
  const prefix = `${parentPath}.`;
  return corpusSelect<SectionRow>(
    `SELECT s.* FROM section s
       JOIN work w ON w.id = s.work_id
      WHERE w.slug = $1 AND s.language = $2
        AND s.ordinal_path LIKE $3
        AND instr(substr(s.ordinal_path, $4), '.') = 0
      ORDER BY s.ordering`,
    [workSlug, language, `${prefix}%`, prefix.length + 1],
  );
}

export async function listCitations(sectionId: number): Promise<CitationRow[]> {
  return corpusSelect<CitationRow>(
    `SELECT * FROM citation WHERE section_id = $1 ORDER BY span_start`,
    [sectionId],
  );
}

// ── Cross-references ────────────────────────────────────────────────────────

export interface XrefHit {
  to_book_slug: string;
  to_book_name: string;
  to_chapter: number;
  to_verse_start: number;
  to_verse_end: number | null;
  to_text: string;
  weight: number;
}

/** All cross-refs originating at a single verse, joined to target book/verse
 *  metadata. Ordered by weight desc. */
export async function listXrefsForVerse(
  language: CorpusLanguage,
  bookSlug: string,
  chapter: number,
  verse: number,
  limit = 25,
): Promise<XrefHit[]> {
  return corpusSelect<XrefHit>(
    `SELECT b2.slug AS to_book_slug,
            b2.name AS to_book_name,
            c2.number AS to_chapter,
            v2_start.number AS to_verse_start,
            v2_end.number AS to_verse_end,
            v2_start.text_plain AS to_text,
            x.weight AS weight
       FROM xref x
       JOIN verse v_from   ON v_from.id = x.from_verse_id
       JOIN chapter c_from ON c_from.id = v_from.chapter_id
       JOIN book b_from    ON b_from.id = c_from.book_id
       JOIN verse v2_start ON v2_start.id = x.to_verse_start
       JOIN chapter c2     ON c2.id = v2_start.chapter_id
       JOIN book b2        ON b2.id = c2.book_id
       LEFT JOIN verse v2_end ON v2_end.id = x.to_verse_end
      WHERE b_from.language = $1
        AND b_from.slug = $2
        AND c_from.number = $3
        AND v_from.number = $4
        AND b2.language = $1
      ORDER BY x.weight DESC
      LIMIT $5`,
    [language, bookSlug, chapter, verse, limit],
  );
}

// Keep tree-shaken TS happy: types are re-exported where helpful.
export type { XrefRow };

export async function getStrongs(id: string): Promise<StrongsRow | null> {
  return corpusSelectOne<StrongsRow>(
    `SELECT * FROM strongs WHERE id = $1`,
    [id],
  );
}

/**
 * Bulk lookup of Strong's entries by id. Returns a Map keyed by Strong's id so
 * callers can do O(1) gloss lookups while rendering a chapter's worth of words.
 * SQLite has a generous parameter limit (~32k by default); a chapter rarely has
 * more than a few hundred unique strongs ids, so one IN-clause query is fine.
 */
export async function getStrongsByIds(
  ids: readonly string[],
): Promise<Map<string, StrongsRow>> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
  const rows = await corpusSelect<StrongsRow>(
    `SELECT * FROM strongs WHERE id IN (${placeholders})`,
    [...ids],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

export interface SearchHit {
  verse_id: number;
  book_slug: string;
  book_name: string;
  /** Translation/language id of the matching verse — for badging in the UI. */
  translation: CorpusLanguage;
  chapter: number;
  verse: number;
  snippet: string;
}

// Detects FTS5 operators / phrase syntax. When present we hand the query
// through verbatim so power users can write `("foo" OR bar*) NOT baz` without
// our tokenizer corrupting it.
const FTS_OPERATOR_RE = /["*()]|\b(?:AND|OR|NOT|NEAR)\b/;

export function buildFtsQuery(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (FTS_OPERATOR_RE.test(trimmed)) return trimmed;
  // Wrap each whitespace-separated token in a phrase + prefix marker so a
  // mid-typed fragment ("begi") still matches "beginning". Quoting also
  // protects non-ASCII Hebrew/Greek tokens from being mis-parsed as bare
  // FTS terms.
  return trimmed
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" ");
}

const SEARCH_MARK_OPEN = "";
const SEARCH_MARK_CLOSE = "";

/**
 * Run a full-text search over every bible-translation verse in the corpus.
 * Returns up to `limit` matches ordered by FTS rank, starting at `offset`.
 * Snippet uses control-character delimiters that the UI parses out into spans
 * (avoids HTML injection).
 */
export async function searchVerses(
  query: string,
  limit = 30,
  offset = 0,
): Promise<SearchHit[]> {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];
  return corpusSelect<SearchHit>(
    `SELECT v.id AS verse_id,
            b.slug AS book_slug,
            b.name AS book_name,
            b.language AS translation,
            c.number AS chapter,
            v.number AS verse,
            snippet(verse_fts, 0, $2, $3, '…', 12) AS snippet
       FROM verse_fts
       JOIN verse v   ON v.id = verse_fts.rowid
       JOIN chapter c ON c.id = v.chapter_id
       JOIN book b    ON b.id = c.book_id
      WHERE verse_fts MATCH $1
      ORDER BY rank
      LIMIT $4 OFFSET $5`,
    [ftsQuery, SEARCH_MARK_OPEN, SEARCH_MARK_CLOSE, limit, offset],
  );
}

export { SEARCH_MARK_OPEN, SEARCH_MARK_CLOSE };

export interface ChapterPayload {
  book: BookRow;
  chapter: ChapterRow;
  verses: VerseRow[];
  /** Words keyed by verse_id; only populated for tagged languages (he, gk). */
  wordsByVerse: Record<number, WordRow[]>;
  /** All chapter numbers in this book, in order — for prev/next nav. */
  chapterNumbers: number[];
}

export async function listBooksByLanguage(
  language: CorpusLanguage,
): Promise<BookRow[]> {
  const fallback = FALLBACK_LANGUAGE[language];
  if (!fallback) {
    return corpusSelect<BookRow>(
      `SELECT * FROM book WHERE language = $1 ORDER BY order_index`,
      [language],
    );
  }
  // Union: take every book the requested language has, plus any books from the
  // fallback language whose slugs the primary doesn't cover (e.g. BSB + WEB
  // apocrypha so "English (Modern)" exposes the deuterocanon in the sidebar).
  return corpusSelect<BookRow>(
    `SELECT * FROM book
      WHERE language = $1
      UNION ALL
     SELECT * FROM book
      WHERE language = $2
        AND slug NOT IN (SELECT slug FROM book WHERE language = $1)
      ORDER BY order_index`,
    [language, fallback],
  );
}

/// "English (Modern)" is virtual: BSB for protocanonical, WEB for deuterocanon.
/// BSB has no apocrypha, so any request for en_bsb that returns nothing falls
/// back transparently to en_web. The fallback target is exposed here so callers
/// (e.g. listBooksByLanguage) can apply the same rule.
const FALLBACK_LANGUAGE: Partial<Record<CorpusLanguage, CorpusLanguage>> = {
  en_bsb: "en_web",
};

export async function findBook(
  language: CorpusLanguage,
  slug: string,
): Promise<BookRow | null> {
  const direct = await corpusSelectOne<BookRow>(
    `SELECT * FROM book WHERE language = $1 AND (slug = $2 OR lower(name) = lower($2))`,
    [language, slug],
  );
  if (direct) return direct;
  const fallback = FALLBACK_LANGUAGE[language];
  if (!fallback) return null;
  return corpusSelectOne<BookRow>(
    `SELECT * FROM book WHERE language = $1 AND (slug = $2 OR lower(name) = lower($2))`,
    [fallback, slug],
  );
}

export type VersificationMode = "native" | "mt";

export async function getChapter(
  language: CorpusLanguage,
  bookSlug: string,
  chapterNumber: number,
  options: { versification?: VersificationMode } = {},
): Promise<ChapterPayload | null> {
  const segments =
    options.versification === "mt" && isLXXVersified(language)
      ? getMTSegments(bookSlug, chapterNumber)
      : null;
  if (segments !== null) {
    return getRemappedChapter(language, bookSlug, chapterNumber, segments);
  }

  const book = await findBook(language, bookSlug);
  if (!book) return null;

  const chapter = await corpusSelectOne<ChapterRow>(
    `SELECT * FROM chapter WHERE book_id = $1 AND number = $2`,
    [book.id, chapterNumber],
  );
  if (!chapter) return null;

  const verses = await corpusSelect<VerseRow>(
    `SELECT * FROM verse WHERE chapter_id = $1 ORDER BY number`,
    [chapter.id],
  );

  const chapterNumbersRows = await corpusSelect<{ number: number }>(
    `SELECT number FROM chapter WHERE book_id = $1 ORDER BY number`,
    [book.id],
  );

  // Words: only tagged languages produce useful rows. Avoid the join cost for English.
  let wordsByVerse: Record<number, WordRow[]> = {};
  if (language === "he" || language === "gk") {
    const words = await corpusSelect<WordRow>(
      `SELECT w.* FROM word w
         JOIN verse v ON v.id = w.verse_id
        WHERE v.chapter_id = $1
        ORDER BY w.verse_id, w.position`,
      [chapter.id],
    );
    wordsByVerse = {};
    for (const w of words) {
      (wordsByVerse[w.verse_id] ||= []).push(w);
    }
  }

  return {
    book,
    chapter,
    verses,
    wordsByVerse,
    chapterNumbers: chapterNumbersRows.map((r) => r.number),
  };
}

/**
 * Fetch an MT-numbered chapter from an LXX-versified language by stitching
 * verses from one or more LXX source chapters according to the segment map.
 * Verses are renumbered to their MT positions via `dstVerseOffset` and the
 * synthetic ChapterRow reports the requested MT chapter number.
 *
 * Word rows (for `gk`) are remapped too — same verse_id mapping rule so the
 * interlinear/Strong's overlays still resolve correctly even though the
 * verse.number a consumer sees has been rewritten.
 */
async function getRemappedChapter(
  language: CorpusLanguage,
  bookSlug: string,
  mtChapter: number,
  segments: MTSegment[],
): Promise<ChapterPayload | null> {
  const book = await findBook(language, bookSlug);
  if (!book) return null;

  const srcChapterNumbers = Array.from(
    new Set(segments.map((s) => s.srcChapter)),
  );
  const srcChapters = await corpusSelect<ChapterRow>(
    `SELECT * FROM chapter
       WHERE book_id = $1 AND number IN (${srcChapterNumbers.map((_, i) => `$${i + 2}`).join(", ")})`,
    [book.id, ...srcChapterNumbers],
  );
  const srcChapterByNumber = new Map(srcChapters.map((c) => [c.number, c]));

  const collectedVerses: VerseRow[] = [];
  const collectedChapterIds: number[] = [];
  for (const seg of segments) {
    const srcChapter = srcChapterByNumber.get(seg.srcChapter);
    if (!srcChapter) continue;
    collectedChapterIds.push(srcChapter.id);
    const end = Number.isFinite(seg.srcVerseEnd) ? seg.srcVerseEnd : 1_000_000;
    const segVerses = await corpusSelect<VerseRow>(
      `SELECT * FROM verse
         WHERE chapter_id = $1 AND number >= $2 AND number <= $3
         ORDER BY number`,
      [srcChapter.id, seg.srcVerseStart, end],
    );
    for (const v of segVerses) {
      collectedVerses.push({ ...v, number: v.number + seg.dstVerseOffset });
    }
  }
  collectedVerses.sort((a, b) => a.number - b.number);

  let wordsByVerse: Record<number, WordRow[]> = {};
  if ((language === "he" || language === "gk") && collectedChapterIds.length > 0) {
    const placeholders = collectedChapterIds.map((_, i) => `$${i + 1}`).join(", ");
    const words = await corpusSelect<WordRow>(
      `SELECT w.* FROM word w
         JOIN verse v ON v.id = w.verse_id
        WHERE v.chapter_id IN (${placeholders})
        ORDER BY w.verse_id, w.position`,
      collectedChapterIds,
    );
    for (const w of words) {
      (wordsByVerse[w.verse_id] ||= []).push(w);
    }
  }

  // The MT chapter number list for a divergent book is the full MT range, not
  // the native chapter table. For Jeremiah both happen to be 1-52 so we can
  // safely reuse the native list; revisit if Psalms/Daniel/Esther are added.
  const chapterNumbersRows = await corpusSelect<{ number: number }>(
    `SELECT number FROM chapter WHERE book_id = $1 ORDER BY number`,
    [book.id],
  );

  // Synthesize a ChapterRow stamped with the MT chapter number. `id` is set to
  // the primary (first) segment's source chapter id so callers that key off
  // chapter.id (e.g. legacy cache code) still see a real row reference.
  const primarySrcId = srcChapterByNumber.get(segments[0].srcChapter)?.id ?? 0;
  const synthChapter: ChapterRow = {
    id: primarySrcId,
    book_id: book.id,
    number: mtChapter,
    verse_count: collectedVerses.length,
  };

  return {
    book,
    chapter: synthChapter,
    verses: collectedVerses,
    wordsByVerse,
    chapterNumbers: chapterNumbersRows.map((r) => r.number),
  };
}
