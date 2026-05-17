import { describe, expect, it } from "vitest";
import { formatRgba, parseColor, toHex } from "./colorFormat";

describe("parseColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseColor("#f5f1e8")).toEqual({ kind: "hex", value: "#f5f1e8" });
  });

  it("expands 3-digit hex", () => {
    expect(parseColor("#abc")).toEqual({ kind: "hex", value: "#aabbcc" });
  });

  it("parses 8-digit hex as rgba", () => {
    const p = parseColor("#000000ff");
    expect(p).toMatchObject({ kind: "hex", value: "#000000" });
  });

  it("parses rgb() modern syntax with alpha", () => {
    expect(parseColor("rgb(0 0 0 / 0.25)")).toEqual({
      kind: "rgba",
      r: 0,
      g: 0,
      b: 0,
      a: 0.25,
    });
  });

  it("parses rgba() legacy syntax", () => {
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual({
      kind: "rgba",
      r: 10,
      g: 20,
      b: 30,
      a: 0.5,
    });
  });

  it("returns null on garbage", () => {
    expect(parseColor("salmon")).toBeNull();
    expect(parseColor("")).toBeNull();
  });

  it("collapses a=1 rgba to hex", () => {
    expect(parseColor("rgb(255 128 0 / 1)")).toEqual({
      kind: "hex",
      value: "#ff8000",
    });
  });
});

describe("formatRgba", () => {
  it("emits modern rgb-with-alpha for translucent colors", () => {
    expect(formatRgba(0, 0, 0, 0.25)).toBe("rgb(0 0 0 / 0.25)");
  });

  it("collapses to hex for fully-opaque colors", () => {
    expect(formatRgba(245, 241, 232, 1)).toBe("#f5f1e8");
  });
});

describe("toHex", () => {
  it("drops alpha from rgba", () => {
    expect(toHex({ kind: "rgba", r: 0, g: 0, b: 0, a: 0.25 })).toBe("#000000");
  });

  it("passes hex through unchanged", () => {
    expect(toHex({ kind: "hex", value: "#abc123" })).toBe("#abc123");
  });
});
