import { describe, expect, it } from "vitest";
import { isRootPath } from "./isRootPath";

describe("isRootPath", () => {
  it("matches the site root and slash-only paths", () => {
    expect(isRootPath("/")).toBe(true);
    expect(isRootPath("")).toBe(true);
    expect(isRootPath("//")).toBe(true);
    expect(isRootPath("///")).toBe(true);
  });

  it("rejects real app paths", () => {
    expect(isRootPath("/reader/bible/gen/1")).toBe(false);
    expect(isRootPath("/search")).toBe(false);
  });
});
