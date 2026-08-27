import { describe, expect, it } from "vitest";
import {
  normalizeSectionLabel,
  parseHeadingLabel,
  shortenLabel,
  seriesLabel,
} from "./sectionLabels";

describe("normalizeSectionLabel", () => {
  it("strips trailing editorial fragments", () => {
    expect(normalizeSectionLabel("Section XLI. — Sect")).toBe("Section XLI.");
  });

  it("collapses empty caption stubs", () => {
    expect(normalizeSectionLabel("Section III. — : — Now I come")).toBe(
      "Section III. — Now I come",
    );
  });

  it("collapses internal whitespace", () => {
    expect(normalizeSectionLabel("Chapter  I.  —  Intro.")).toBe(
      "Chapter I. — Intro.",
    );
  });
});

describe("shortenLabel", () => {
  it("returns short labels unchanged", () => {
    expect(shortenLabel("Chapter I.")).toBe("Chapter I.");
  });

  it("truncates at first sentence-ending punctuation", () => {
    const long =
      "Chapter I.—The salutation. Praise of the Corinthians before the breaking forth of schism among them.";
    expect(shortenLabel(long)).toBe("Chapter I.");
  });
});

describe("parseHeadingLabel", () => {
  it("splits rubric and caption", () => {
    expect(parseHeadingLabel("Chapter VI.—Charge of atheism refuted.")).toEqual({
      lead: "Chapter VI.",
      rest: "Charge of atheism refuted.",
    });
  });

  it("drops long synthesized captions", () => {
    const longCaption =
      "Section I. — FIRST of all, I would just touch upon some of the heads of your preamble and review them at length";
    expect(parseHeadingLabel(longCaption)).toEqual({
      lead: "Section I.",
      rest: null,
    });
  });
});

describe("seriesLabel", () => {
  it("maps ANF volume slugs", () => {
    expect(seriesLabel("anf01.justin-martyr")).toBe("ANF I");
  });

  it("maps NPNF series slugs", () => {
    expect(seriesLabel("npnf204.athanasius")).toBe("NPNF² IV");
  });
});
