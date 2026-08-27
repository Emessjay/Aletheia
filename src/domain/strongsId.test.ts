import { describe, expect, it } from "vitest";
import { lexiconStrongsId, normalizeStrongsId } from "./strongsId";

describe("normalizeStrongsId", () => {
  it("strips leading zeros and instance suffixes", () => {
    expect(normalizeStrongsId("H0430G")).toBe("H430");
    expect(normalizeStrongsId("H1254A")).toBe("H1254");
    expect(normalizeStrongsId("G0976")).toBe("G976");
  });

  it("prefers the root after a slash in dStrongs forms", () => {
    expect(normalizeStrongsId("H9003/{H7225G}")).toBe("H7225");
    expect(normalizeStrongsId("H9009/H8064")).toBe("H8064");
  });
});

describe("lexiconStrongsId", () => {
  it("falls back from STEPBible prefix codes to lemma", () => {
    expect(lexiconStrongsId("H9003", "H7225G")).toBe("H7225");
    expect(lexiconStrongsId("H9009", "H8064")).toBe("H8064");
  });

  it("uses strongs directly when it is a real lexicon id", () => {
    expect(lexiconStrongsId("H1254", "H1254A")).toBe("H1254");
    expect(lexiconStrongsId("G2316", null)).toBe("G2316");
  });

  it("returns null when neither field resolves", () => {
    expect(lexiconStrongsId(null, null)).toBeNull();
    expect(lexiconStrongsId("HR/Ncfsa", null)).toBeNull();
  });
});
