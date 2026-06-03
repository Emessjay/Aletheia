/**
 * Anchor-in-URL contract: the reader's "Discuss" deep link and the feed's
 * bookmarkable query string round-trip through these helpers, and garbage
 * params degrade to the default anchor instead of breaking the page.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANCHOR,
  anchorFromSearchParams,
  anchorToSearchParams,
  discussUrl,
  readerUrl,
} from "./anchor";

describe("anchorFromSearchParams", () => {
  it("parses a full query string", () => {
    const p = new URLSearchParams("work=bible&book=john&chapter=3&verse=16");
    expect(anchorFromSearchParams(p)).toEqual({
      work_slug: "bible",
      book_slug: "john",
      chapter: 3,
      verse: 16,
    });
  });

  it("falls back to the default anchor when params are missing", () => {
    expect(anchorFromSearchParams(new URLSearchParams())).toEqual(
      DEFAULT_ANCHOR,
    );
  });

  it("degrades per-field on garbage instead of failing the page", () => {
    const p = new URLSearchParams("book=john&chapter=potato&verse=-4");
    expect(anchorFromSearchParams(p)).toEqual({
      work_slug: DEFAULT_ANCHOR.work_slug,
      book_slug: "john",
      chapter: DEFAULT_ANCHOR.chapter,
      verse: DEFAULT_ANCHOR.verse,
    });
  });

  it("round-trips through anchorToSearchParams", () => {
    const anchor = { work_slug: "bible", book_slug: "ps", chapter: 23, verse: 4 };
    expect(anchorFromSearchParams(anchorToSearchParams(anchor))).toEqual(anchor);
  });
});

describe("discussUrl / readerUrl", () => {
  it("builds the group-feed deep link from a reader VerseRef", () => {
    const url = discussUrl("g1", {
      workSlug: "bible",
      bookSlug: "john",
      chapter: 3,
      verse: 16,
    });
    expect(url).toBe("/study-groups/g1?work=bible&book=john&chapter=3&verse=16");
  });

  it("builds the reader URL with the #v flash anchor", () => {
    expect(
      readerUrl({ work_slug: "bible", book_slug: "john", chapter: 3, verse: 16 }),
    ).toBe("/reader/bible/john/3#v16");
  });
});
