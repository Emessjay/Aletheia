import { corpusSelect, corpusSelectOne } from "./corpus";
import type {
  BookRow,
  ChapterRow,
  CorpusLanguage,
  VerseRow,
  WordRow,
} from "./types";

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
  return corpusSelect<BookRow>(
    `SELECT * FROM book WHERE language = $1 ORDER BY order_index`,
    [language],
  );
}

export async function findBook(
  language: CorpusLanguage,
  slug: string,
): Promise<BookRow | null> {
  return corpusSelectOne<BookRow>(
    `SELECT * FROM book WHERE language = $1 AND slug = $2`,
    [language, slug],
  );
}

export async function getChapter(
  language: CorpusLanguage,
  bookSlug: string,
  chapterNumber: number,
): Promise<ChapterPayload | null> {
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
