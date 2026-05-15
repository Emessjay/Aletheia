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
});
