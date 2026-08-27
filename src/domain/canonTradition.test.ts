import { describe, expect, it } from "vitest";
import {
  CANON_TRADITIONS,
  classifyExtraBook,
  isCanonTradition,
} from "./canonTradition";

/** Full WEB/KJV-apocrypha deutero set in the corpus. */
const CORPUS_EXTRA = [
  "1es",
  "2es",
  "tob",
  "jdt",
  "wis",
  "sir",
  "bar",
  "lje",
  "s3y",
  "sus",
  "bel",
  "man",
  "1mac",
  "2mac",
  "3mac",
  "4mac",
  "ps151",
] as const;

const CATHOLIC = new Set([
  "tob",
  "jdt",
  "wis",
  "sir",
  "bar",
  "lje",
  "s3y",
  "sus",
  "bel",
  "1mac",
  "2mac",
]);

const ORTHODOX_ONLY = new Set(["1es", "man", "3mac", "ps151"]);

describe("classifyExtraBook", () => {
  it("labels every corpus extra as apocrypha under Protestant", () => {
    for (const slug of CORPUS_EXTRA) {
      expect(classifyExtraBook(slug, "protestant")).toBe("apocrypha");
    }
  });

  it("splits Catholic deuterocanon from remaining apocrypha", () => {
    for (const slug of CORPUS_EXTRA) {
      const expected = CATHOLIC.has(slug) ? "deuterocanon" : "apocrypha";
      expect(classifyExtraBook(slug, "catholic")).toBe(expected);
    }
  });

  it("adds Orthodox-only books to deuterocanon and leaves 2es/4mac as apocrypha", () => {
    for (const slug of CORPUS_EXTRA) {
      const isDeutero = CATHOLIC.has(slug) || ORTHODOX_ONLY.has(slug);
      expect(classifyExtraBook(slug, "orthodox")).toBe(
        isDeutero ? "deuterocanon" : "apocrypha",
      );
    }
    expect(classifyExtraBook("2es", "orthodox")).toBe("apocrypha");
    expect(classifyExtraBook("4mac", "orthodox")).toBe("apocrypha");
  });

  it("defaults unknown slugs to apocrypha", () => {
    expect(classifyExtraBook("unknown-book", "catholic")).toBe("apocrypha");
  });
});

describe("isCanonTradition", () => {
  it("accepts the known traditions", () => {
    for (const t of CANON_TRADITIONS) {
      expect(isCanonTradition(t)).toBe(true);
    }
  });

  it("rejects other values", () => {
    expect(isCanonTradition(null)).toBe(false);
    expect(isCanonTradition("")).toBe(false);
    expect(isCanonTradition("jewish")).toBe(false);
  });
});
