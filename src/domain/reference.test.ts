import { describe, expect, it } from "vitest";
import { parseReference } from "./reference";

describe("parseReference", () => {
  it("parses canonical 'John 3:16'", () => {
    expect(parseReference("John 3:16")).toEqual({
      bookSlug: "john",
      chapter: 3,
      verse: 16,
      href: "/reader/bible/john/3#v16",
    });
  });

  it("parses lowercase abbreviations: 'mt 5.7'", () => {
    const r = parseReference("mt 5.7");
    expect(r?.bookSlug).toBe("matt");
    expect(r?.chapter).toBe(5);
    expect(r?.verse).toBe(7);
  });

  it("parses books with numeric prefix: '1 Cor 13'", () => {
    const r = parseReference("1 Cor 13");
    expect(r?.bookSlug).toBe("1cor");
    expect(r?.chapter).toBe(13);
    expect(r?.verse).toBeNull();
  });

  it("parses no-space numeric form: '1cor 13:4'", () => {
    const r = parseReference("1cor 13:4");
    expect(r?.bookSlug).toBe("1cor");
    expect(r?.chapter).toBe(13);
    expect(r?.verse).toBe(4);
  });

  it("parses 'Ps 23' as Psalms chapter 23", () => {
    const r = parseReference("Ps 23");
    expect(r?.bookSlug).toBe("ps");
    expect(r?.chapter).toBe(23);
  });

  it("parses bare book name to chapter 1", () => {
    const r = parseReference("John");
    expect(r?.bookSlug).toBe("john");
    expect(r?.chapter).toBe(1);
    expect(r?.verse).toBeNull();
  });

  it("rejects junk", () => {
    expect(parseReference("hello world")).toBeNull();
    expect(parseReference("")).toBeNull();
    expect(parseReference("   ")).toBeNull();
  });

  it("prefers longer alias when ambiguous: 'jn' vs 'john'", () => {
    expect(parseReference("john 1")?.bookSlug).toBe("john");
    expect(parseReference("jn 1")?.bookSlug).toBe("john");
  });

  it("handles trailing punctuation and extra spaces", () => {
    const r = parseReference("  matt.  5:7  ");
    expect(r?.bookSlug).toBe("matt");
    expect(r?.chapter).toBe(5);
    expect(r?.verse).toBe(7);
  });

  it("parses space-separated chapter and verse: 'john 3 16'", () => {
    const r = parseReference("john 3 16");
    expect(r?.bookSlug).toBe("john");
    expect(r?.chapter).toBe(3);
    expect(r?.verse).toBe(16);
    expect(r?.href).toBe("/reader/bible/john/3#v16");
  });

  it("parses space-separated with numeric book prefix: '1 cor 13 4'", () => {
    const r = parseReference("1 cor 13 4");
    expect(r?.bookSlug).toBe("1cor");
    expect(r?.chapter).toBe(13);
    expect(r?.verse).toBe(4);
  });

  it("keeps single integer as chapter only: 'john 3'", () => {
    const r = parseReference("john 3");
    expect(r?.bookSlug).toBe("john");
    expect(r?.chapter).toBe(3);
    expect(r?.verse).toBeNull();
  });

  // "phil" overlaps both Philippians ("phil") and Philemon (which has "phile"
  // as one of its aliases). The longest-match rule has to keep these apart.
  it("'phil' resolves to Philippians, not Philemon", () => {
    expect(parseReference("phil 1:1")?.bookSlug).toBe("phil");
    expect(parseReference("philippians 2")?.bookSlug).toBe("phil");
  });

  it("'phile' / 'phlm' / 'philemon' all resolve to Philemon", () => {
    expect(parseReference("phile 1")?.bookSlug).toBe("phlm");
    expect(parseReference("phlm 1")?.bookSlug).toBe("phlm");
    expect(parseReference("philemon 1:6")?.bookSlug).toBe("phlm");
  });

  it("parses every common '1 Cor' spelling", () => {
    for (const s of ["1cor 13", "1 cor 13", "1Cor 13", "1 Corinthians 13"]) {
      expect(parseReference(s)?.bookSlug).toBe("1cor");
      expect(parseReference(s)?.chapter).toBe(13);
    }
  });

  it("parses every common '2 Cor' spelling", () => {
    for (const s of ["2cor 5:17", "2 cor 5:17", "2Cor 5:17", "2 Corinthians 5:17"]) {
      const r = parseReference(s);
      expect(r?.bookSlug).toBe("2cor");
      expect(r?.chapter).toBe(5);
      expect(r?.verse).toBe(17);
    }
  });

  it("parses other numbered books", () => {
    expect(parseReference("1 Sam 17")?.bookSlug).toBe("1sam");
    expect(parseReference("2sam 11:2")?.bookSlug).toBe("2sam");
    expect(parseReference("1kings 8")?.bookSlug).toBe("1kgs");
    expect(parseReference("3 John 1")?.bookSlug).toBe("3john");
  });

  it("rejects Roman-numeral prefixes ('I Cor' / 'II Cor')", () => {
    // We do not currently translate Roman numerals; locking the contract
    // so a future change is conscious, not a silent regression.
    expect(parseReference("I Cor 13")).toBeNull();
    expect(parseReference("II Cor 13")).toBeNull();
  });

  it("treats a bare two-letter fragment ('ph') as unknown", () => {
    expect(parseReference("ph 5")).toBeNull();
  });
});
