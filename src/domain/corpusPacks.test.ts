import { describe, expect, it } from "vitest";
import {
  CORPUS_PACKS,
  formatPackBytes,
  packMeta,
  tabRequiresPack,
} from "./corpusPacks";

describe("corpusPacks registry", () => {
  it("lists every expected pack id once", () => {
    const ids = CORPUS_PACKS.map((p) => p.id);
    expect(ids).toEqual([
      "base",
      "interlinear",
      "commentaries",
      "anf",
      "npnf",
      "reformers",
      "audio-modern-en",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("documents the Strong's / interlinear split on the interlinear pack", () => {
    const note = packMeta("interlinear")?.description ?? "";
    expect(note.toLowerCase()).toMatch(/word/);
  });

  it("gates only the commentaries tab by pack id", () => {
    expect(tabRequiresPack("commentaries")).toBe("commentaries");
    expect(tabRequiresPack("patristics")).toBeNull();
    expect(tabRequiresPack("read")).toBeNull();
  });

  it("formats sizes", () => {
    expect(formatPackBytes(null)).toBe("—");
    expect(formatPackBytes(512)).toBe("1 KiB");
    expect(formatPackBytes(5 * 1024 * 1024)).toBe("5.0 MiB");
  });
});
