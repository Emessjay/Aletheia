import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createBookmark,
  createHighlight,
  createLibrary,
  createNote,
  listBookmarks,
  listChapterAnnotations,
  listLibraries,
  softDeleteBookmark,
  softDeleteHighlight,
  softDeleteLibrary,
  softDeleteNote,
  updateNote,
  type ChapterAnnotations,
} from "./user";
import type {
  BookmarkRow,
  HighlightColor,
  LibraryRow,
  VerseRef,
} from "./types";
import { isTauri } from "@/lib/tauri";

const USER_STALE = 30_000;

function userChapterKey(work: string, book: string, chapter: number) {
  return ["user", "annotations", work, book, chapter] as const;
}

export function useChapterAnnotations(
  work: string,
  book: string,
  chapter: number,
) {
  return useQuery<ChapterAnnotations>({
    queryKey: userChapterKey(work, book, chapter),
    queryFn: () => listChapterAnnotations(work, book, chapter),
    staleTime: USER_STALE,
    enabled: isTauri() && !!work && !!book && Number.isFinite(chapter),
  });
}

export function useLibraries() {
  return useQuery<LibraryRow[]>({
    queryKey: ["user", "libraries"],
    queryFn: listLibraries,
    staleTime: USER_STALE,
    enabled: isTauri(),
  });
}

export function useBookmarks(libraryId: string | null) {
  return useQuery<BookmarkRow[]>({
    queryKey: ["user", "bookmarks", libraryId],
    queryFn: () => (libraryId ? listBookmarks(libraryId) : Promise.resolve([])),
    staleTime: USER_STALE,
    enabled: isTauri() && libraryId !== null,
  });
}

export function useCreateHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      ref,
      color,
      translation,
      range,
    }: {
      ref: VerseRef;
      color: HighlightColor;
      translation?: string | null;
      range?: { startToken: number; endToken: number } | null;
    }) => createHighlight(ref, color, translation ?? null, range ?? null),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: userChapterKey(
          vars.ref.workSlug,
          vars.ref.bookSlug,
          vars.ref.chapter,
        ),
      });
    },
  });
}

export function useDeleteHighlight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; ref: VerseRef }) =>
      softDeleteHighlight(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: userChapterKey(
          vars.ref.workSlug,
          vars.ref.bookSlug,
          vars.ref.chapter,
        ),
      });
    },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, body }: { ref: VerseRef; body: string }) =>
      createNote(ref, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: userChapterKey(
          vars.ref.workSlug,
          vars.ref.bookSlug,
          vars.ref.chapter,
        ),
      });
    },
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: string;
      ref: VerseRef;
    }) => updateNote(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: userChapterKey(
          vars.ref.workSlug,
          vars.ref.bookSlug,
          vars.ref.chapter,
        ),
      });
    },
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; ref: VerseRef }) => softDeleteNote(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: userChapterKey(
          vars.ref.workSlug,
          vars.ref.bookSlug,
          vars.ref.chapter,
        ),
      });
    },
  });
}

export function useCreateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createLibrary(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user", "libraries"] });
    },
  });
}

export function useDeleteLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeleteLibrary(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user", "libraries"] });
    },
  });
}

export function useCreateBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      libraryId,
      ref,
      translation,
      label,
    }: {
      libraryId: string;
      ref: VerseRef;
      translation?: string | null;
      label?: string | null;
    }) => createBookmark(libraryId, ref, translation ?? null, label ?? null),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["user", "bookmarks", vars.libraryId] });
    },
  });
}

export function useDeleteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; libraryId: string }) =>
      softDeleteBookmark(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["user", "bookmarks", vars.libraryId] });
    },
  });
}
