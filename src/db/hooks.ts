import { useQuery } from "@tanstack/react-query";
import type { CorpusLanguage } from "./types";
import {
  getChapter,
  listBooksByLanguage,
  type ChapterPayload,
} from "./queries";

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
