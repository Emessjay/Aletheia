import { describe, expect, it } from "vitest";
import { findScriptureReferences, romanToInt } from "./scriptureRefs";

function refs(text: string) {
  return findScriptureReferences(text).map((r) => ({
    text: r.text,
    slug: r.parsed.bookSlug,
    chapter: r.parsed.chapter,
    verse: r.parsed.verse,
    href: r.parsed.href,
  }));
}

describe("romanToInt", () => {
  it("handles canonical numerals", () => {
    expect(romanToInt("I")).toBe(1);
    expect(romanToInt("IV")).toBe(4);
    expect(romanToInt("IX")).toBe(9);
    expect(romanToInt("XV")).toBe(15);
    expect(romanToInt("XL")).toBe(40);
    expect(romanToInt("CL")).toBe(150);
    expect(romanToInt("xv")).toBe(15);
  });
});

describe("findScriptureReferences — common forms", () => {
  it("detects 'Rom. 1:20' mid-sentence", () => {
    const out = refs("As Paul writes in Rom. 1:20, the invisible things…");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      slug: "rom", chapter: 1, verse: 20,
      href: "/reader/bible/rom/1#v20",
    });
  });

  it("detects unabbreviated 'Romans 1:20'", () => {
    const out = refs("see Romans 1:20 for the source");
    expect(out[0]).toMatchObject({ slug: "rom", chapter: 1, verse: 20 });
  });

  it("detects chapter-only 'Psalm 19'", () => {
    const out = refs("recall Psalm 19 entirely");
    expect(out[0]).toMatchObject({ slug: "ps", chapter: 19, verse: null });
    expect(out[0].href).toBe("/reader/bible/ps/19");
  });

  it("detects 'Gen. 3:5'", () => {
    expect(refs("after Gen. 3:5 was uttered")[0]).toMatchObject({
      slug: "gen", chapter: 3, verse: 5,
    });
  });

  it("detects 'John 3:16'", () => {
    expect(refs("John 3:16 famously says")[0]).toMatchObject({
      slug: "john", chapter: 3, verse: 16,
    });
  });

  it("ranges link to first verse only ('Rom. 1:20-23')", () => {
    const out = refs("citing Rom. 1:20-23 here");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      slug: "rom", chapter: 1, verse: 20,
      href: "/reader/bible/rom/1#v20",
    });
    expect(out[0].text).toContain("23");
  });
});

describe("findScriptureReferences — Roman numerals", () => {
  it("detects 'Luke xv. 24' from CCEL-style prose", () => {
    const out = refs("read of Thy younger son [Luke xv. 24] that he was");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      slug: "luke", chapter: 15, verse: 24,
      href: "/reader/bible/luke/15#v24",
    });
  });

  it("detects 'Rom. XIII' (Latin Summa)", () => {
    const out = refs("ad Rom. XIII, qui potestati resistit");
    expect(out[0]).toMatchObject({
      slug: "rom", chapter: 13, verse: null,
    });
  });

  it("detects 'Matt. v. 7' (chapter+verse, both numerals)", () => {
    const out = refs("see Matt. v. 7 for the saying");
    expect(out[0]).toMatchObject({ slug: "matt", chapter: 5, verse: 7 });
  });

  it("detects '1 John ii. 1' with numeric-prefix book", () => {
    const out = refs("as in 1 John ii. 1 he assures us");
    expect(out[0]).toMatchObject({ slug: "1john", chapter: 2, verse: 1 });
  });
});

describe("findScriptureReferences — numeric-prefix books", () => {
  it("detects '1 Cor 13:4'", () => {
    expect(refs("note 1 Cor 13:4 here")[0]).toMatchObject({
      slug: "1cor", chapter: 13, verse: 4,
    });
  });

  it("detects '2 Pet. 3:9' with period after abbr", () => {
    expect(refs("recall 2 Pet. 3:9 plainly")[0]).toMatchObject({
      slug: "2pet", chapter: 3, verse: 9,
    });
  });

  it("detects '1John 4:8' with no space between digit and name", () => {
    expect(refs("see 1John 4:8")[0]).toMatchObject({
      slug: "1john", chapter: 4, verse: 8,
    });
  });
});

describe("findScriptureReferences — false-positive guards", () => {
  it("does not match 'in 1925'", () => {
    expect(refs("born in 1925 to a family")).toEqual([]);
  });

  it("does not match 'Chapter VIII' (no book name)", () => {
    expect(refs("see Chapter VIII for the rest")).toEqual([]);
  });

  it("does not match all-lowercase 'is 1' (Isaiah false positive)", () => {
    expect(refs("there is 1 reason only")).toEqual([]);
  });

  it("does not match all-lowercase 'am 5' (Amos false positive)", () => {
    expect(refs("I am 5 feet tall")).toEqual([]);
  });

  it("ignores page-number patterns 'p. 27' (no book name)", () => {
    expect(refs("see p. 27 for details")).toEqual([]);
  });

  it("rejects implausibly large chapters ('Rom 99999')", () => {
    expect(refs("Rom 99999 nonsense")).toEqual([]);
  });

  it("does not match 'St. John' alone (no chapter)", () => {
    expect(refs("As St. John reminds us")).toEqual([]);
  });

  it("does not match 'Am I' (Amos + pronoun)", () => {
    expect(refs("Am I therefore become your enemy?")).toEqual([]);
  });

  it("respects per-book chapter cap: 'Ep. 34' is not Ephesians", () => {
    expect(refs("Eusebius's Ep. 34 mentions the council")).toEqual([]);
  });

  it("respects per-book chapter cap: 'Daniel 57' is rejected", () => {
    expect(refs("see Daniel 57 for the reference")).toEqual([]);
  });

  it("respects per-book chapter cap: 'Rev. C.' rejected (Rev caps at 22)", () => {
    expect(refs("see Rev. C. in the index")).toEqual([]);
  });

  it("does not match blocked alias 'Man'", () => {
    expect(refs("Man 1 said something here")).toEqual([]);
  });

  it("accepts single-roman chapter with period: 'John I.'", () => {
    const out = refs("see John I. for context");
    expect(out).toHaveLength(1);
    expect(out[0].chapter).toBe(1);
  });

  it("accepts single-roman chapter with following verse: 'John I 5'", () => {
    const out = refs("see John I 5 here");
    expect(out[0]).toMatchObject({ slug: "john", chapter: 1, verse: 5 });
  });
});

describe("findScriptureReferences — multiple refs in one string", () => {
  it("finds two non-overlapping refs", () => {
    const text = "compare Rom. 1:20 with Ps. 19:1 directly";
    const out = findScriptureReferences(text);
    expect(out).toHaveLength(2);
    expect(out[0].parsed.bookSlug).toBe("rom");
    expect(out[1].parsed.bookSlug).toBe("ps");
    expect(out[0].end).toBeLessThanOrEqual(out[1].start);
  });

  it("preserves correct spans for slice/replace", () => {
    const text = "see Rom. 1:20 here";
    const out = findScriptureReferences(text);
    expect(out).toHaveLength(1);
    expect(text.slice(out[0].start, out[0].end)).toBe("Rom. 1:20");
  });
});

describe("findScriptureReferences — sentence boundaries", () => {
  it("does not bleed into the next sentence: 'See Gen. 3:5. Then Rom 1'", () => {
    const out = refs("See Gen. 3:5. Then Rom 1 says…");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ slug: "gen", chapter: 3, verse: 5 });
    expect(out[1]).toMatchObject({ slug: "rom", chapter: 1, verse: null });
  });

  it("handles trailing punctuation cleanly", () => {
    const out = refs("(Romans 8:28)");
    expect(out[0]).toMatchObject({ slug: "rom", chapter: 8, verse: 28 });
  });
});

describe("findScriptureReferences — single-chapter books", () => {
  // Books with one chapter (Obadiah, Philemon, 2 John, 3 John, Jude,
  // Letter of Jeremiah, Bel, Susanna, Prayer of Manasseh) are conventionally
  // cited "Book N" where N is the verse, not the chapter. The detector
  // remaps "3 John 9" to 3 John 1:9 so the citation links to the right verse.
  it("maps '3 John 9' to chapter 1 verse 9", () => {
    const out = refs("see (3 John 9), and so on");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      slug: "3john",
      chapter: 1,
      verse: 9,
      href: "/reader/bible/3john/1#v9",
    });
  });

  it("maps 'Jude 14' to chapter 1 verse 14", () => {
    const out = refs("as Jude 14 says");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ slug: "jude", chapter: 1, verse: 14 });
  });

  it("maps 'Philemon 8' to chapter 1 verse 8", () => {
    const out = refs("in Phlm. 8 we read");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ slug: "phlm", chapter: 1, verse: 8 });
  });

  it("maps 'Obadiah 4' to chapter 1 verse 4", () => {
    const out = refs("see Obad. 4 here");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ slug: "obad", chapter: 1, verse: 4 });
  });
});
