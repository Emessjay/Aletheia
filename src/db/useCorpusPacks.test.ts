import { describe, expect, it } from "vitest";
import {
  installedPackIds,
  isPackInstalled,
  isTabAllowedByPacks,
} from "./useCorpusPacks";
import type { CorpusPackStatus } from "@/domain/corpusPacks";

function status(
  id: string,
  installed: boolean,
): CorpusPackStatus {
  return { id, installed, kind: "sqlite" };
}

describe("pack gating helpers", () => {
  it("assumes all packs installed before the first status fetch", () => {
    const ids = installedPackIds(undefined);
    expect(ids.has("commentaries")).toBe(true);
    expect(ids.has("interlinear")).toBe(true);
  });

  it("hides commentaries when that pack is absent", () => {
    const packs = [
      status("base", true),
      status("commentaries", false),
      status("anf", true),
    ];
    expect(isTabAllowedByPacks("commentaries", packs)).toBe(false);
    expect(isTabAllowedByPacks("resources", packs)).toBe(true);
    expect(isTabAllowedByPacks("read", packs)).toBe(true);
  });

  it("reports audio pack install state", () => {
    const packs = [status("audio-modern-en", false)];
    expect(isPackInstalled(packs, "audio-modern-en")).toBe(false);
  });
});
