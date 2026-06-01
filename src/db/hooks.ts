import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  CorpusLanguage,
  SectionOutlineRow,
  SectionRow,
  WorkRow,
} from "./types";
import {
  getCanon,
  getChapter,
  getCommentaryBookIntro,
  getSection,
  getStrongs,
  listBooksByLanguage,
  listChapterCommentary,
  listChildSections,
  listCitations,
  listCommentaries,
  listCommentaryBooks,
  listCommentaryChapters,
  listPatristicWorks,
  listSectionOutline,
  listXrefsForVerse,
  searchVerses,
  type ChapterPayload,
  type CommentaryBookEntry,
  type PatristicLanguage,
  type SearchHit,
  type VersificationMode,
  type XrefHit,
} from "./queries";

export function useStrongs(id: string | null) {
  return useQuery({
    queryKey: ["corpus", "strongs", id],
    queryFn: () => (id ? getStrongs(id) : Promise.resolve(null)),
    enabled: id !== null,
  });
}

export function useSearch(query: string, limit = 30) {
  const q = query.trim();
  return useQuery<SearchHit[]>({
    queryKey: ["corpus", "search", q, limit],
    queryFn: () => searchVerses(q, limit),
    enabled: q.length > 0,
    // Search is read-only over the immutable corpus, but the query string
    // changes often — modest staleness is fine.
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Paginated search. Each page fetches up to `pageSize` hits; `maxResults`
 * caps total loaded so a query like "the" can't stream the entire corpus.
 */
export function useInfiniteSearch(
  query: string,
  pageSize = 100,
  maxResults = 1000,
) {
  const q = query.trim();
  return useInfiniteQuery<SearchHit[]>({
    queryKey: ["corpus", "search-infinite", q, pageSize, maxResults],
    queryFn: ({ pageParam = 0 }) =>
      searchVerses(q, pageSize, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.length, 0);
      // No more pages if the last fetch came up short, or if we hit the cap.
      if (lastPage.length < pageSize) return undefined;
      if (loaded >= maxResults) return undefined;
      return loaded;
    },
    enabled: q.length > 0,
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

/**
 * Canonical book order + per-book chapter counts for the active primary
 * translation. Feeds the continuous-scroll reader's next/previous-chapter
 * derivation. The canon is immutable for a session, so cache it forever.
 */
export function useCanon(language: CorpusLanguage) {
  return useQuery({
    queryKey: ["corpus", "canon", language],
    queryFn: () => getCanon(language),
    staleTime: Infinity,
  });
}

export function useChapter(
  language: CorpusLanguage,
  bookSlug: string,
  chapterNumber: number,
  options: { versification?: VersificationMode } = {},
) {
  const versification = options.versification ?? "native";
  return useQuery<ChapterPayload | null>({
    queryKey: [
      "corpus",
      "chapter",
      language,
      bookSlug,
      chapterNumber,
      versification,
    ],
    queryFn: () => getChapter(language, bookSlug, chapterNumber, { versification }),
  });
}

// ── Commentaries ──────────────────────────────────────────────────────────

export function useCommentaries() {
  return useQuery<WorkRow[]>({
    queryKey: ["corpus", "commentaries"],
    queryFn: listCommentaries,
    staleTime: Infinity,
  });
}

export function useCommentaryBooks(workSlug: string | null) {
  return useQuery<CommentaryBookEntry[]>({
    queryKey: ["corpus", "commentary", workSlug, "books"],
    queryFn: () => (workSlug ? listCommentaryBooks(workSlug) : Promise.resolve([])),
    enabled: !!workSlug,
    staleTime: Infinity,
  });
}

export function useCommentaryBookIntro(
  workSlug: string | null,
  bookSlug: string | null,
) {
  return useQuery<string>({
    queryKey: ["corpus", "commentary", workSlug, "intro", bookSlug],
    queryFn: () =>
      workSlug && bookSlug
        ? getCommentaryBookIntro(workSlug, bookSlug)
        : Promise.resolve(""),
    enabled: !!workSlug && !!bookSlug,
    staleTime: Infinity,
  });
}

export function useCommentaryChapters(
  workSlug: string | null,
  bookSlug: string | null,
) {
  return useQuery<SectionRow[]>({
    queryKey: ["corpus", "commentary", workSlug, "chapters", bookSlug],
    queryFn: () =>
      workSlug && bookSlug
        ? listCommentaryChapters(workSlug, bookSlug)
        : Promise.resolve([]),
    enabled: !!workSlug && !!bookSlug,
    staleTime: Infinity,
  });
}

// ── Patristic works ────────────────────────────────────────────────────────

export function usePatristicWorks() {
  return useQuery<WorkRow[]>({
    queryKey: ["corpus", "patristic-works"],
    queryFn: listPatristicWorks,
    staleTime: Infinity,
  });
}

export function useWorkSectionOutline(
  workSlug: string,
  language: PatristicLanguage = "en",
) {
  return useQuery<SectionOutlineRow[]>({
    queryKey: ["corpus", "work-section-outline", workSlug, language],
    queryFn: () => listSectionOutline(workSlug, language),
    enabled: !!workSlug,
  });
}

export function useSection(
  workSlug: string,
  ordinalPath: string,
  language: PatristicLanguage = "en",
) {
  return useQuery({
    queryKey: ["corpus", "section", workSlug, ordinalPath, language],
    queryFn: () => getSection(workSlug, ordinalPath, language),
    enabled: !!workSlug && !!ordinalPath,
  });
}

export function useChildSections(
  workSlug: string,
  parentPath: string,
  language: PatristicLanguage = "en",
) {
  return useQuery({
    queryKey: ["corpus", "section-children", workSlug, parentPath, language],
    queryFn: () => listChildSections(workSlug, parentPath, language),
    enabled: !!workSlug && !!parentPath,
  });
}

export function useSectionCitations(sectionId: number | null) {
  return useQuery({
    queryKey: ["corpus", "citations", sectionId],
    queryFn: () =>
      sectionId === null ? Promise.resolve([]) : listCitations(sectionId),
    enabled: sectionId !== null,
  });
}

export function useChapterCommentary(
  workSlug: string | null,
  bookSlug: string | null,
  chapter: number | null,
) {
  return useQuery<SectionRow[]>({
    queryKey: [
      "corpus",
      "commentary",
      workSlug,
      "chapter-content",
      bookSlug,
      chapter,
    ],
    queryFn: () =>
      workSlug && bookSlug && chapter != null
        ? listChapterCommentary(workSlug, bookSlug, chapter)
        : Promise.resolve([]),
    enabled: !!workSlug && !!bookSlug && chapter != null && chapter > 0,
    staleTime: Infinity,
  });
}
