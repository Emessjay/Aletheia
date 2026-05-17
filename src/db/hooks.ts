import { useQuery } from "@tanstack/react-query";
import type { CorpusLanguage } from "./types";
import {
  getChapter,
  getStrongs,
  listBooksByLanguage,
  listXrefsForVerse,
  searchVerses,
  type ChapterPayload,
  type SearchHit,
  type XrefHit,
} from "./queries";

export function useStrongs(id: string | null) {
  return useQuery({
    queryKey: ["corpus", "strongs", id],
    queryFn: () => (id ? getStrongs(id) : Promise.resolve(null)),
    enabled: id !== null,
  });
}

export function useSearch(
  query: string,
  language: CorpusLanguage = "en_bsb",
  limit = 30,
) {
  const q = query.trim();
  return useQuery<SearchHit[]>({
    queryKey: ["corpus", "search", language, q, limit],
    queryFn: () => searchVerses(q, language, limit),
    enabled: q.length > 0,
    // Search is read-only over the immutable corpus, but the query string
    // changes often — modest staleness is fine.
    staleTime: 5 * 60 * 1000,
  });
}

// ── Cross-references ────────────────────────────────────────────────────────

export function useVerseXrefs(
  language: CorpusLanguage,
  bookSlug: string,
  chapter: number,
  verse: number,
) {
  return useQuery<XrefHit[]>({
    queryKey: ["corpus", "xrefs", language, bookSlug, chapter, verse],
    queryFn: () => listXrefsForVerse(language, bookSlug, chapter, verse),
    enabled:
      !!bookSlug &&
      Number.isFinite(chapter) &&
      chapter > 0 &&
      Number.isFinite(verse) &&
      verse > 0,
  });
}

export function useBooks(language: CorpusLanguage) {
  return useQuery({
    queryKey: ["corpus", "books", language],
    queryFn: () => listBooksByLanguage(language),
  });
}

export function useChapter(
  language: CorpusLanguage,
  bookSlug: string,
  chapterNumber: number,
) {
  return useQuery<ChapterPayload | null>({
    queryKey: ["corpus", "chapter", language, bookSlug, chapterNumber],
    queryFn: () => getChapter(language, bookSlug, chapterNumber),
  });
}
