import { describe, expect, it } from "vitest";
import { _testing } from "./SectionBody";

const { tokenize, stripAllTokens } = _testing;

describe("SectionBody tokenizer", () => {
  it("treats text without tokens as a single text node", () => {
    const tree = tokenize("plain prose with no markup.");
    expect(tree).toEqual([
      { kind: "text", value: "plain prose with no markup." },
    ]);
  });

  it("wraps italic text in an em node", () => {
    const tree = tokenize("a {em}word{/em} here");
    expect(tree).toEqual([
      { kind: "text", value: "a " },
      { kind: "em", children: [{ kind: "text", value: "word" }] },
      { kind: "text", value: " here" },
    ]);
  });

  it("captures heading openers with their level and closes uniformly", () => {
    const tree = tokenize("{h2}Section 1{/h}\n\nbody");
    expect(tree).toEqual([
      { kind: "h", level: 2, children: [{ kind: "text", value: "Section 1" }] },
      { kind: "text", value: "\n\nbody" },
    ]);
  });

  it("captures footnote with id and inline body", () => {
    const tree = tokenize("see also{fn:7}Ps. cxlv. 3.{/fn} the next line");
    expect(tree).toEqual([
      { kind: "text", value: "see also" },
      {
        kind: "fn",
        id: "7",
        children: [{ kind: "text", value: "Ps. cxlv. 3." }],
      },
      { kind: "text", value: " the next line" },
    ]);
  });

  it("nests inline emphasis inside a block quote", () => {
    const tree = tokenize("{q}foo {em}bar{/em} baz{/q}");
    expect(tree).toEqual([
      {
        kind: "q",
        children: [
          { kind: "text", value: "foo " },
          { kind: "em", children: [{ kind: "text", value: "bar" }] },
          { kind: "text", value: " baz" },
        ],
      },
    ]);
  });

  it("tolerates an unmatched closer by ignoring it", () => {
    const tree = tokenize("{em}open never closed and a stray {/q} closer");
    // The stray `{/q}` is silently dropped; remaining text stays inside the
    // un-closed em wrapper so the surrounding prose isn't lost.
    expect(tree).toEqual([
      {
        kind: "em",
        children: [
          { kind: "text", value: "open never closed and a stray " },
          { kind: "text", value: " closer" },
        ],
      },
    ]);
  });

  it("strips all known tokens with stripAllTokens", () => {
    const s =
      "before {em}italic{/em} mid {h3}heading{/h} {fn:1}note text{/fn} {q}quoted{/q} after";
    expect(stripAllTokens(s)).toBe(
      "before italic mid heading note text quoted after",
    );
  });
});
