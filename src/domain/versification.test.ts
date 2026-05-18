import { describe, expect, it } from "vitest";
import {
  activeTabsRequireMTRemap,
  getMTSegments,
  isLXXVersified,
  isMTVersified,
  VERSIFICATION_MAPS,
} from "./versification";
import type { Tab } from "./tabs";
import type { CorpusLanguage } from "@/db/types";

describe("versification language predicates", () => {
  it("classifies Greek and Brenton EN as LXX-versified", () => {
    expect(isLXXVersified("gk")).toBe(true);
    expect(isLXXVersified("en_brenton")).toBe(true);
  });

  it("classifies Hebrew + KJV/BSB/WEB as MT-versified", () => {
    expect(isMTVersified("he")).toBe(true);
    expect(isMTVersified("en_bsb")).toBe(true);
    expect(isMTVersified("en_kjv")).toBe(true);
    expect(isMTVersified("en_web")).toBe(true);
  });

  it("treats Latin as neither", () => {
    expect(isLXXVersified("la")).toBe(false);
    expect(isMTVersified("la")).toBe(false);
  });
});

describe("activeTabsRequireMTRemap", () => {
  const single = (lang: CorpusLanguage): Tab => ({
    kind: "single",
    lang,
    active: true,
  });

  it("returns true when a single Greek tab is shown with single English (BSB)", () => {
    expect(activeTabsRequireMTRemap([single("gk"), single("en_bsb")])).toBe(true);
  });

  it("returns true when Greek is shown with Hebrew (both protocanonical sides on opposite versifications)", () => {
    expect(activeTabsRequireMTRemap([single("gk"), single("he")])).toBe(true);
  });

  it("returns false when only Greek is shown", () => {
    expect(activeTabsRequireMTRemap([single("gk")])).toBe(false);
  });

  it("returns false when Greek + Brenton EN are shown (both LXX-versified)", () => {
    expect(activeTabsRequireMTRemap([single("gk"), single("en_brenton")])).toBe(false);
  });

  it("returns false when only English tabs are shown", () => {
    expect(activeTabsRequireMTRemap([single("en_bsb"), single("en_kjv")])).toBe(false);
  });

  it("ignores interlinear tabs even when they mix LXX + MT languages", () => {
    const interlinear: Tab = {
      kind: "interlinear",
      primary: "gk",
      secondary: "en_bsb",
      active: true,
    };
    expect(activeTabsRequireMTRemap([interlinear])).toBe(false);
    // An interlinear paired with a Hebrew single still triggers remap on the
    // Hebrew-vs-Greek-single comparison axis, but the interlinear itself does not.
    expect(activeTabsRequireMTRemap([interlinear, single("he")])).toBe(false);
  });
});

describe("Jeremiah MT→LXX mapping", () => {
  const jer = VERSIFICATION_MAPS.jer!;

  it("has entries for the diverging chapters MT 25-51", () => {
    for (let ch = 25; ch <= 51; ch += 1) {
      expect(jer[ch], `MT Jer ${ch} should have a mapping`).toBeDefined();
    }
  });

  it("leaves MT 1-24 + MT 52 as identity (no entry)", () => {
    expect(jer[1]).toBeUndefined();
    expect(jer[24]).toBeUndefined();
    expect(jer[52]).toBeUndefined();
  });

  it("MT 25 stitches LXX 25:1-13 + LXX 32 (cup of wrath continuation)", () => {
    const segs = getMTSegments("jer", 25)!;
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ srcChapter: 25, srcVerseStart: 1, srcVerseEnd: 13, dstVerseOffset: 0 });
    expect(segs[1]).toMatchObject({ srcChapter: 32, srcVerseStart: 1, dstVerseOffset: 14 });
  });

  it("MT 26-43 map to LXX 33-50 (the +7 oracles-relocation offset)", () => {
    for (let mt = 26; mt <= 43; mt += 1) {
      const segs = getMTSegments("jer", mt)!;
      expect(segs).toHaveLength(1);
      expect(segs[0].srcChapter).toBe(mt + 7);
      expect(segs[0].dstVerseOffset).toBe(0);
    }
  });

  it("MT 44 + MT 45 split LXX 51 (Baruch prophecy at 45)", () => {
    const mt44 = getMTSegments("jer", 44)!;
    const mt45 = getMTSegments("jer", 45)!;
    expect(mt44[0]).toMatchObject({ srcChapter: 51, srcVerseStart: 1, srcVerseEnd: 30 });
    expect(mt45[0]).toMatchObject({ srcChapter: 51, srcVerseStart: 31, srcVerseEnd: 35, dstVerseOffset: -30 });
  });

  it("MT 46-51 swap LXX 26, 29, 31, 30, 27, 28 (Oracles Against the Nations)", () => {
    expect(getMTSegments("jer", 46)![0].srcChapter).toBe(26); // Egypt
    expect(getMTSegments("jer", 47)![0].srcChapter).toBe(29); // Philistia
    expect(getMTSegments("jer", 48)![0].srcChapter).toBe(31); // Moab
    expect(getMTSegments("jer", 49)![0].srcChapter).toBe(30); // Ammon/Edom/...
    expect(getMTSegments("jer", 50)![0].srcChapter).toBe(27); // Babylon
    expect(getMTSegments("jer", 51)![0].srcChapter).toBe(28); // Babylon (cont.)
  });

  it("returns null for books with no map", () => {
    expect(getMTSegments("gen", 1)).toBeNull();
    expect(getMTSegments("ps", 9)).toBeNull(); // Psalms divergence not yet implemented
  });
});
