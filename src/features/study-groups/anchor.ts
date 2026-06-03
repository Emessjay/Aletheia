/**
 * Feed anchors in URLs. The group feed is anchored to a verse; carrying that
 * anchor in the query string (`/study-groups/:id?work=…&book=…&chapter=…&verse=…`)
 * makes a discussion bookmarkable and lets the reader's "Discuss" action deep
 * link straight to the right verse. Parsing is per-field forgiving — a
 * mangled or missing param falls back rather than blowing up the page.
 */
import type { VerseRef } from "@/db/types";

export interface FeedAnchor {
  work_slug: string;
  book_slug: string;
  chapter: number;
  verse: number;
}

export const DEFAULT_ANCHOR: FeedAnchor = {
  work_slug: "bible",
  book_slug: "gen",
  chapter: 1,
  verse: 1,
};

function positiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

export function anchorFromSearchParams(params: URLSearchParams): FeedAnchor {
  return {
    work_slug: params.get("work") || DEFAULT_ANCHOR.work_slug,
    book_slug: params.get("book") || DEFAULT_ANCHOR.book_slug,
    chapter: positiveInt(params.get("chapter"), DEFAULT_ANCHOR.chapter),
    verse: positiveInt(params.get("verse"), DEFAULT_ANCHOR.verse),
  };
}

export function anchorToSearchParams(anchor: FeedAnchor): URLSearchParams {
  return new URLSearchParams({
    work: anchor.work_slug,
    book: anchor.book_slug,
    chapter: String(anchor.chapter),
    verse: String(anchor.verse),
  });
}

/** The group-feed URL discussing the given reader verse. */
export function discussUrl(groupId: string, ref: VerseRef): string {
  const q = anchorToSearchParams({
    work_slug: ref.workSlug,
    book_slug: ref.bookSlug,
    chapter: ref.chapter,
    verse: ref.verse,
  });
  return `/study-groups/${groupId}?${q.toString()}`;
}

/** The reader URL for the verse a feed anchor points at (#v scroll-and-flash). */
export function readerUrl(anchor: FeedAnchor): string {
  return `/reader/${anchor.work_slug}/${anchor.book_slug}/${anchor.chapter}#v${anchor.verse}`;
}
