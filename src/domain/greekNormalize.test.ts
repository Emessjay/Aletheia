import { describe, expect, it } from "vitest";
import {
  greekNormalizeKey,
  isAllCapsGreek,
  lookupByGreekSurface,
} from "./greekNormalize";

describe("greekNormalizeKey", () => {
  it("casefolds all-caps LXX tokens onto lowercase NT keys", () => {
    // Brenton / grcbrent often ships uncials; NT TAGNT is lowercase + accents.
    expect(greekNormalizeKey("ΕΝ")).toBe(greekNormalizeKey("εν"));
    expect(greekNormalizeKey("ΘΕΟΣ")).toBe(greekNormalizeKey("θεος"));
    expect(greekNormalizeKey("ΛΌΓΟΣ")).toBe(greekNormalizeKey("λόγος"));
  });

  it("strips edge punctuation and folds final sigma", () => {
    expect(greekNormalizeKey("γῆν.")).toBe(greekNormalizeKey("γῆν"));
    expect(greekNormalizeKey("λόγος")).toBe(greekNormalizeKey("λόγοσ"));
  });

  it("returns null for non-letter tokens", () => {
    expect(greekNormalizeKey("")).toBeNull();
    expect(greekNormalizeKey("·—,")).toBeNull();
  });
});

describe("isAllCapsGreek", () => {
  it("detects uncial LXX-style tokens", () => {
    expect(isAllCapsGreek("ΕΝ")).toBe(true);
    expect(isAllCapsGreek("ἘΝ")).toBe(true);
    expect(isAllCapsGreek("ΘΕΟΣ")).toBe(true);
  });

  it("rejects mixed-case and lowercase", () => {
    expect(isAllCapsGreek("Θεὸς")).toBe(false);
    expect(isAllCapsGreek("ἀρχῇ")).toBe(false);
    expect(isAllCapsGreek("123")).toBe(false);
  });
});

describe("lookupByGreekSurface", () => {
  it("finds English undertext for an all-caps LXX surface via lowercase key", () => {
    // Simulate NT TAGNT map: normalized surface → BSB-derived English.
    // Accents are part of the key: unaccented ΕΝ ↔ εν; ἘΝ ↔ ἐν.
    const englishByGreek = new Map<string, string>([
      [greekNormalizeKey("ἐν")!, "in"],
      [greekNormalizeKey("εν")!, "in"],
      [greekNormalizeKey("ἀρχῇ")!, "beginning"],
    ]);

    // Before casefold: Map.get("ΕΝ") misses. After: ΕΝ → εν key hits "in".
    expect(englishByGreek.get("ΕΝ")).toBeUndefined();
    expect(lookupByGreekSurface(englishByGreek, "ΕΝ")).toBe("in");
    expect(lookupByGreekSurface(englishByGreek, "ἘΝ")).toBe("in");
    expect(lookupByGreekSurface(englishByGreek, "ἀρχῇ")).toBe("beginning");
  });
});
