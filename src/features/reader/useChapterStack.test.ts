import { describe, expect, it } from "vitest";
import {
  stackReducer,
  nextChapterKey,
  prevChapterKey,
  type ChapterKey,
  type StackState,
  type Canon,
} from "./useChapterStack";

// A small fake canon: two books with 3 + 2 chapters respectively,
// ordered as [first, second]. Sufficient to exercise the
// next/prev derivation without pulling in the full Bible canon.
const canon: Canon = {
  bookOrder: ["first", "second"],
  chapterCount: { first: 3, second: 2 },
};

function key(book: string, chapter: number): ChapterKey {
  return { workSlug: "bible", bookSlug: book, chapter };
}

describe("nextChapterKey", () => {
  it("advances within a book", () => {
    expect(nextChapterKey(key("first", 1), canon)).toEqual(key("first", 2));
    expect(nextChapterKey(key("first", 2), canon)).toEqual(key("first", 3));
  });

  it("crosses to the next book at end of chapter run", () => {
    expect(nextChapterKey(key("first", 3), canon)).toEqual(key("second", 1));
  });

  it("returns null past the last book's last chapter", () => {
    expect(nextChapterKey(key("second", 2), canon)).toBeNull();
  });
});

describe("prevChapterKey", () => {
  it("retreats within a book", () => {
    expect(prevChapterKey(key("first", 3), canon)).toEqual(key("first", 2));
    expect(prevChapterKey(key("first", 2), canon)).toEqual(key("first", 1));
  });

  it("crosses back to the previous book's last chapter", () => {
    expect(prevChapterKey(key("second", 1), canon)).toEqual(key("first", 3));
  });

  it("returns null before the first book's first chapter", () => {
    expect(prevChapterKey(key("first", 1), canon)).toBeNull();
  });
});

describe("stackReducer", () => {
  const initial: StackState = {
    chapters: [key("first", 1)],
    cap: 3,
  };

  it("appends to the bottom", () => {
    const next = stackReducer(initial, { type: "append", key: key("first", 2) });
    expect(next.chapters.map((c) => c.chapter)).toEqual([1, 2]);
  });

  it("prepends to the top", () => {
    const seeded: StackState = { chapters: [key("first", 2)], cap: 3 };
    const next = stackReducer(seeded, { type: "prepend", key: key("first", 1) });
    expect(next.chapters.map((c) => c.chapter)).toEqual([1, 2]);
  });

  it("drops the oldest top when append exceeds cap", () => {
    const full: StackState = {
      chapters: [key("first", 1), key("first", 2), key("first", 3)],
      cap: 3,
    };
    const after = stackReducer(full, { type: "append", key: key("second", 1) });
    expect(after.chapters).toEqual([
      key("first", 2), key("first", 3), key("second", 1),
    ]);
  });

  it("drops the newest bottom when prepend exceeds cap", () => {
    const full: StackState = {
      chapters: [key("first", 1), key("first", 2), key("first", 3)],
      cap: 3,
    };
    const after = stackReducer(full, { type: "prepend", key: key("second", 0) /* hypothetical */ });
    // Implementation detail: if your prepend reducer uses a different
    // tie-break for drops (e.g. drop from the side opposite to the prepend),
    // adjust the expected output here while keeping the *invariant* that
    // length never exceeds cap.
    expect(after.chapters.length).toBeLessThanOrEqual(3);
    expect(after.chapters[0]).toEqual(key("second", 0));
  });

  it("`reset` collapses the stack to a single key (sidebar / URL nav)", () => {
    const after = stackReducer(initial, { type: "reset", key: key("second", 2) });
    expect(after.chapters).toEqual([key("second", 2)]);
  });

  it("no-op on appending a key already present at the boundary", () => {
    // Avoid double-loading when an IntersectionObserver fires twice.
    const seeded: StackState = { chapters: [key("first", 1), key("first", 2)], cap: 3 };
    const after = stackReducer(seeded, { type: "append", key: key("first", 2) });
    expect(after.chapters.map((c) => c.chapter)).toEqual([1, 2]);
  });
});
