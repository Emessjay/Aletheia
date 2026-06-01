// Chapter-stack model for the continuous-scroll reader.
//
// The reader no longer shows one chapter at a time. Instead ReaderRoute keeps
// a small, bounded list of loaded chapters (the "stack") and renders one
// `<ChapterSection>` per entry, top-to-bottom. As the user scrolls past the
// bottom of the last chapter the next chapter in canon order is appended;
// scrolling past the top prepends the previous one. To keep the DOM bounded
// the stack is capped (see `MAX_CHAPTERS`); appending past the cap drops the
// topmost chapter, prepending past the cap drops the bottommost.
//
// Everything here is intentionally pure so it tests cleanly without a DOM,
// React, or the corpus. The IntersectionObserver wiring, scroll-anchor
// preservation, and URL sync live in ReaderRoute; this module only answers
// "what chapter comes next/before this one?" and "how does an append/prepend/
// reset mutate the list?".

import { useReducer } from "react";

/** A pointer into the corpus: which work, which book, which chapter. */
export interface ChapterKey {
  workSlug: string;
  bookSlug: string;
  chapter: number;
}

/**
 * Enough of the canon to derive next/previous chapters. `bookOrder` lists book
 * slugs in canonical (`order_index`) order for the active primary translation;
 * `chapterCount` maps each book slug to how many chapters it has. Built from
 * the corpus by `getCanon()` in db/queries.ts and threaded in via `useCanon`.
 */
export interface Canon {
  bookOrder: string[];
  chapterCount: Record<string, number>;
}

export interface StackState {
  chapters: ChapterKey[];
  /** Hard upper bound on `chapters.length`. */
  cap: number;
}

export type StackAction =
  | { type: "append"; key: ChapterKey }
  | { type: "prepend"; key: ChapterKey }
  | { type: "reset"; key: ChapterKey };

/** Default in-DOM chapter budget. Soft tunable — see spec AC #4. */
export const MAX_CHAPTERS = 7;

export function sameKey(a: ChapterKey, b: ChapterKey): boolean {
  return (
    a.workSlug === b.workSlug &&
    a.bookSlug === b.bookSlug &&
    a.chapter === b.chapter
  );
}

export function chapterKeyId(k: ChapterKey): string {
  return `${k.workSlug}:${k.bookSlug}:${k.chapter}`;
}

/**
 * The chapter after `key` in canon order, or null at the tail of the canon.
 * Advances within a book until its last chapter, then crosses to chapter 1 of
 * the next book in `bookOrder`.
 */
export function nextChapterKey(key: ChapterKey, canon: Canon): ChapterKey | null {
  const count = canon.chapterCount[key.bookSlug];
  if (count != null && key.chapter < count) {
    return { ...key, chapter: key.chapter + 1 };
  }
  const idx = canon.bookOrder.indexOf(key.bookSlug);
  if (idx < 0 || idx >= canon.bookOrder.length - 1) return null;
  const nextBook = canon.bookOrder[idx + 1];
  return { workSlug: key.workSlug, bookSlug: nextBook, chapter: 1 };
}

/**
 * The chapter before `key` in canon order, or null at the head of the canon.
 * Retreats within a book until chapter 1, then crosses to the last chapter of
 * the previous book in `bookOrder`.
 */
export function prevChapterKey(key: ChapterKey, canon: Canon): ChapterKey | null {
  if (key.chapter > 1) {
    return { ...key, chapter: key.chapter - 1 };
  }
  const idx = canon.bookOrder.indexOf(key.bookSlug);
  if (idx <= 0) return null;
  const prevBook = canon.bookOrder[idx - 1];
  const prevCount = canon.chapterCount[prevBook] ?? 1;
  return { workSlug: key.workSlug, bookSlug: prevBook, chapter: prevCount };
}

/**
 * Reducer over the loaded-chapter list.
 *
 * - `append`/`prepend` are no-ops if the key is already present (guards against
 *   an IntersectionObserver firing twice for the same boundary).
 * - When a mutation would exceed `cap`, the chapter at the *far* end is
 *   dropped: append drops the topmost (oldest) chapter, prepend drops the
 *   bottommost. This keeps the just-added chapter and the chapters adjacent to
 *   it (the ones near the viewport) resident. The orchestration layer is
 *   responsible for not triggering a drop while the to-be-dropped chapter is
 *   still on screen (spec AC #4).
 */
export function stackReducer(state: StackState, action: StackAction): StackState {
  switch (action.type) {
    case "reset":
      return { ...state, chapters: [action.key] };
    case "append": {
      if (state.chapters.some((c) => sameKey(c, action.key))) return state;
      let chapters = [...state.chapters, action.key];
      if (chapters.length > state.cap) {
        chapters = chapters.slice(chapters.length - state.cap);
      }
      return { ...state, chapters };
    }
    case "prepend": {
      if (state.chapters.some((c) => sameKey(c, action.key))) return state;
      let chapters = [action.key, ...state.chapters];
      if (chapters.length > state.cap) {
        chapters = chapters.slice(0, state.cap);
      }
      return { ...state, chapters };
    }
    default:
      return state;
  }
}

/**
 * React binding around `stackReducer`. Initialised once with `initial`; later
 * navigation (sidebar, chapter picker, deep links) drives a `reset` dispatch
 * rather than re-initialising. `cap` is read on mount only.
 */
export function useChapterStack(initial: ChapterKey, cap: number = MAX_CHAPTERS) {
  return useReducer(stackReducer, { chapters: [initial], cap });
}
