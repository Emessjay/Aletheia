import { describe, expect, it } from "vitest";
import { newId } from "./ulid";

describe("newId", () => {
  it("returns a 26-char Crockford-base32 string", () => {
    const id = newId();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("is monotonic across rapid calls", () => {
    const ids = Array.from({ length: 50 }, () => newId());
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it("returns unique ids", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
});
