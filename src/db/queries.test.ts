// Frontend-side tests for src/db/queries.ts. The interesting logic that lives
// purely in JS — the FTS query builder, the empty-query short-circuit, the
// en_bsb → en_web book fallback — is exercised here. The SQL-execution
// behavior of these same queries (FTS5 matching, positional $N binding) is
// covered separately in server/src/__tests__/, which has better-sqlite3
// available; this file does not pull in a real SQLite engine.

import { afterEach, describe, expect, it, vi } from "vitest";

const selectMock = vi.fn();
const selectOneMock = vi.fn();

vi.mock("./corpus", () => ({
  corpusSelect: (sql: string, params?: unknown[]) => selectMock(sql, params),
  corpusSelectOne: (sql: string, params?: unknown[]) =>
    selectOneMock(sql, params),
}));

import {
  buildFtsQuery,
  findBook,
  searchVerses,
  SEARCH_MARK_CLOSE,
  SEARCH_MARK_OPEN,
} from "./queries";

afterEach(() => {
  selectMock.mockReset();
  selectOneMock.mockReset();
});

describe("buildFtsQuery", () => {
  it("returns empty string for blank input", () => {
    expect(buildFtsQuery("")).toBe("");
    expect(buildFtsQuery("   ")).toBe("");
    expect(buildFtsQuery("\t\n  ")).toBe("");
  });

  it("wraps each token in a prefix-quoted form for mid-type matches", () => {
    expect(buildFtsQuery("light")).toBe('"light"*');
    expect(buildFtsQuery("in the beginning")).toBe('"in"* "the"* "beginning"*');
  });

  it("passes FTS5 operators through verbatim", () => {
    // Power-user phrases — double-quotes, asterisk, parens, AND/OR/NOT, NEAR —
    // bypass tokenization so the user's query is what hits SQLite.
    expect(buildFtsQuery('"in the beginning"')).toBe('"in the beginning"');
    expect(buildFtsQuery("light OR dark")).toBe("light OR dark");
    expect(buildFtsQuery("light NEAR dark")).toBe("light NEAR dark");
    expect(buildFtsQuery("(light OR dark) NOT firmament")).toBe(
      "(light OR dark) NOT firmament",
    );
    expect(buildFtsQuery("begi*")).toBe("begi*");
  });

  it("collapses runs of internal whitespace between tokens", () => {
    expect(buildFtsQuery("  foo   bar  ")).toBe('"foo"* "bar"*');
  });

  it("treats lowercase 'and' / 'or' as bare tokens, not operators", () => {
    // The FTS5 operator regex requires uppercase AND/OR — so a typed
    // "light and dark" must round-trip as three quoted prefixes, not a
    // partially-tokenized FTS expression that SQLite would parse as `light
    // AND "dark"*` (which would silently mean something else).
    expect(buildFtsQuery("light and dark")).toBe('"light"* "and"* "dark"*');
  });
});

describe("searchVerses", () => {
  it("short-circuits without hitting the DB on an empty query", async () => {
    const out = await searchVerses("");
    expect(out).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("short-circuits on whitespace-only queries", async () => {
    const out = await searchVerses("    ");
    expect(out).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("hands FTS query, marks, limit, and offset to corpusSelect in order", async () => {
    selectMock.mockResolvedValueOnce([]);
    await searchVerses("in the beginning", 25, 10);
    expect(selectMock).toHaveBeenCalledTimes(1);
    const [, params] = selectMock.mock.calls[0];
    expect(params).toEqual([
      '"in"* "the"* "beginning"*',
      SEARCH_MARK_OPEN,
      SEARCH_MARK_CLOSE,
      25,
      10,
    ]);
  });

  it("uses defaults for limit/offset", async () => {
    selectMock.mockResolvedValueOnce([]);
    await searchVerses("light");
    const [, params] = selectMock.mock.calls[0];
    // Default limit is 30, default offset is 0 per queries.ts.
    expect(params?.[3]).toBe(30);
    expect(params?.[4]).toBe(0);
  });

  it("returns rows verbatim from the adapter", async () => {
    const fakeHits = [
      {
        verse_id: 1,
        book_slug: "gen",
        book_name: "Genesis",
        translation: "en_bsb",
        chapter: 1,
        verse: 1,
        snippet: "In the beginning…",
      },
    ];
    selectMock.mockResolvedValueOnce(fakeHits);
    const out = await searchVerses("beginning");
    expect(out).toEqual(fakeHits);
  });
});

describe("findBook", () => {
  const bsbGen = {
    id: 1,
    language: "en_bsb" as const,
    canon: "protestant" as const,
    slug: "gen",
    name: "Genesis",
    abbreviation: "Gen",
    testament: "old" as const,
    order_index: 1,
  };
  const webTobit = {
    id: 99,
    language: "en_web" as const,
    canon: "deutero" as const,
    slug: "tob",
    name: "Tobit",
    abbreviation: "Tob",
    testament: "deutero" as const,
    order_index: 305,
  };

  it("returns the row when the slug matches directly", async () => {
    selectOneMock.mockResolvedValueOnce(bsbGen);
    const out = await findBook("en_bsb", "gen");
    expect(out).toEqual(bsbGen);
    expect(selectOneMock).toHaveBeenCalledTimes(1);
    const [sql, params] = selectOneMock.mock.calls[0];
    // The query has to accept slug OR case-insensitive name match — both
    // forms run through the same SQL.
    expect(sql).toMatch(/slug = \$2 OR lower\(name\) = lower\(\$2\)/);
    expect(params).toEqual(["en_bsb", "gen"]);
  });

  it("falls back from en_bsb → en_web when the primary has no row", async () => {
    // BSB has no deuterocanon, so 'tob' must transparently resolve through
    // the WEB apocrypha. Two queries, in order.
    selectOneMock.mockResolvedValueOnce(null);
    selectOneMock.mockResolvedValueOnce(webTobit);
    const out = await findBook("en_bsb", "tob");
    expect(out).toEqual(webTobit);
    expect(selectOneMock).toHaveBeenCalledTimes(2);
    expect(selectOneMock.mock.calls[0][1]).toEqual(["en_bsb", "tob"]);
    expect(selectOneMock.mock.calls[1][1]).toEqual(["en_web", "tob"]);
  });

  it("returns null when neither primary nor fallback has the slug", async () => {
    selectOneMock.mockResolvedValueOnce(null);
    selectOneMock.mockResolvedValueOnce(null);
    expect(await findBook("en_bsb", "no-such-book")).toBeNull();
  });

  it("does not attempt a fallback for languages without one", async () => {
    selectOneMock.mockResolvedValueOnce(null);
    const out = await findBook("en_kjv", "no-such-book");
    expect(out).toBeNull();
    expect(selectOneMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a case-insensitive book name as the lookup key", async () => {
    // The OR in the SQL handles this, but the contract is worth pinning: the
    // caller may pass "Genesis", "genesis", or "GENESIS" interchangeably.
    selectOneMock.mockResolvedValueOnce(bsbGen);
    const out = await findBook("en_bsb", "GENESIS");
    expect(out).toEqual(bsbGen);
    expect(selectOneMock.mock.calls[0][1]).toEqual(["en_bsb", "GENESIS"]);
  });
});
