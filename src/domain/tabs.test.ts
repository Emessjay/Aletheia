import { describe, expect, it } from "vitest";
import type { WordRow } from "@/db/types";
import {
  bsbEnglishSurface,
  bsbOriginalUndertext,
  equivalentFor,
  resolveInterlinear,
  wordsForEnglishPrimary,
} from "./tabs";

describe("resolveInterlinear", () => {
  it("makes the drop target primary and the dragged tab secondary", () => {
    expect(resolveInterlinear("en_bsb", "he")).toEqual({
      primary: "he",
      secondary: "en_bsb",
    });
    expect(resolveInterlinear("he", "en_bsb")).toEqual({
      primary: "en_bsb",
      secondary: "he",
    });
  });

  it("allows English-primary with Hebrew or Greek secondary", () => {
    expect(resolveInterlinear("he", "en_bsb")).toEqual({
      primary: "en_bsb",
      secondary: "he",
    });
    expect(resolveInterlinear("gk", "en_bsb")).toEqual({
      primary: "en_bsb",
      secondary: "gk",
    });
  });

  it("allows original-primary with BSB or KJV secondary", () => {
    expect(resolveInterlinear("en_bsb", "he")).toEqual({
      primary: "he",
      secondary: "en_bsb",
    });
    expect(resolveInterlinear("en_kjv", "gk")).toEqual({
      primary: "gk",
      secondary: "en_kjv",
    });
  });

  it("rejects invalid pairs", () => {
    expect(resolveInterlinear("he", "gk")).toBeNull();
    expect(resolveInterlinear("en_bsb", "en_kjv")).toBeNull();
    expect(resolveInterlinear("en_kjv", "en_bsb")).toBeNull();
    expect(resolveInterlinear("he", "he")).toBeNull();
  });
});

describe("equivalentFor", () => {
  it("collapses STEPBible slash compounds and bracket placeholders", () => {
    expect(equivalentFor("the/ heavens")).toBe("the heavens");
    expect(equivalentFor("<obj.>")).toBe("(obj.)");
  });

  it("returns empty string for null undertext", () => {
    expect(equivalentFor(null)).toBe("");
  });
});

describe("bsbEnglishSurface", () => {
  it("trims padding and converts bracket inserts to parentheses", () => {
    expect(bsbEnglishSurface("  In  ")).toBe("In");
    expect(bsbEnglishSurface("[the] beginning")).toBe("(the) beginning");
  });
});

describe("bsbOriginalUndertext", () => {
  it("strips sof pasuq and backslashes", () => {
    expect(bsbOriginalUndertext("הָאָֽרֶץ׃")).toBe("הָאָֽרֶץ");
    expect(bsbOriginalUndertext("foo\\bar")).toBe("foobar");
  });
});

describe("wordsForEnglishPrimary", () => {
  const words: WordRow[] = [
    {
      id: 1,
      verse_id: 10,
      position: 1,
      surface: "In",
      lemma: null,
      strongs: "H7225",
      morphology: null,
      base_text: null,
      english: "בְּרֵאשִׁ֖ית",
    },
    {
      id: 2,
      verse_id: 10,
      position: 2,
      surface: "the",
      lemma: null,
      strongs: "G3588",
      morphology: null,
      base_text: null,
      english: "ὁ",
    },
  ];

  it("keeps only Hebrew Strong's rows for Hebrew secondary", () => {
    expect(wordsForEnglishPrimary(words, "he")).toHaveLength(1);
    expect(wordsForEnglishPrimary(words, "he")[0]?.strongs).toBe("H7225");
  });

  it("keeps only Greek Strong's rows for Greek secondary", () => {
    expect(wordsForEnglishPrimary(words, "gk")).toHaveLength(1);
    expect(wordsForEnglishPrimary(words, "gk")[0]?.strongs).toBe("G3588");
  });

  it("returns empty for non-original secondaries", () => {
    expect(wordsForEnglishPrimary(words, "en_bsb")).toEqual([]);
    expect(wordsForEnglishPrimary(words, "en_kjv")).toEqual([]);
  });
});
