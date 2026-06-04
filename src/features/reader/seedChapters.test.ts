import { describe, expect, it } from "vitest";
import {
  seedChapters,
  nextChapterKey,
  prevChapterKey,
  chapterKeyId,
  sameKey,
  type Canon,
  type ChapterKey,
} from "./useChapterStack";

const canon: Canon = {
  bookOrder: ["first", "second"],
  chapterCount: { first: 3, second: 2 },
};

function key(book: string, chapter: number): ChapterKey {
  return { workSlug: "bible", bookSlug: book, chapter };
}

const ids = (ks: ChapterKey[]) => ks.map(chapterKeyId);

describe("seedChapters", () => {
  it("defaults to one previous + the initial + one next, in canon order", () => {
    expect(ids(seedChapters(key("first", 2), canon))).toEqual(
      ids([key("first", 1), key("first", 2), key("first", 3)]),
    );
  });

  it("places the initial chapter with prev immediately before and next immediately after (anchor contract)", () => {
    // ReaderRoute uses the index of `initial` in this array as the
    // load-time scroll anchor: everything before it mounts above the
    // viewport, everything after below. So the neighbours must be the
    // true canon neighbours, adjacent to the initial.
    const initial = key("first", 2);
    const out = seedChapters(initial, canon);
    const i = out.findIndex((k) => sameKey(k, initial));
    expect(i).toBeGreaterThan(0);
    expect(out[i - 1]).toEqual(prevChapterKey(initial, canon));
    expect(out[i + 1]).toEqual(nextChapterKey(initial, canon));
  });

  it("always includes the initial chapter exactly once", () => {
    const out = seedChapters(key("first", 2), canon);
    expect(out.filter((k) => sameKey(k, key("first", 2)))).toHaveLength(1);
  });

  it("omits the previous side at the canon head (Genesis-1 case)", () => {
    const out = seedChapters(key("first", 1), canon);
    expect(ids(out)).toEqual(ids([key("first", 1), key("first", 2)]));
    // initial is first in the list — nothing mounts above it.
    expect(out[0]).toEqual(key("first", 1));
  });

  it("omits the next side at the canon tail", () => {
    const out = seedChapters(key("second", 2), canon);
    expect(ids(out)).toEqual(ids([key("second", 1), key("second", 2)]));
    expect(out[out.length - 1]).toEqual(key("second", 2));
  });

  it("crosses a book boundary on both sides", () => {
    // prev of second:1 is the previous book's last chapter (first:3);
    // next of second:1 is second:2.
    expect(ids(seedChapters(key("second", 1), canon))).toEqual(
      ids([key("first", 3), key("second", 1), key("second", 2)]),
    );
  });

  it("honours a wider window via opts, clamped at boundaries and de-duplicated", () => {
    // behind:2 from first:2 clamps to just first:1; ahead:2 reaches
    // first:3 then second:1.
    expect(ids(seedChapters(key("first", 2), canon, { behind: 2, ahead: 2 }))).toEqual(
      ids([key("first", 1), key("first", 2), key("first", 3), key("second", 1)]),
    );
    const wide = seedChapters(key("first", 2), canon, { behind: 9, ahead: 9 });
    expect(new Set(ids(wide)).size).toBe(wide.length);
  });

  it("returns the whole list in strict canon order (next of each entry is the following entry)", () => {
    const out = seedChapters(key("first", 1), canon, { behind: 0, ahead: 3 });
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i + 1]).toEqual(nextChapterKey(out[i], canon));
    }
  });
});
