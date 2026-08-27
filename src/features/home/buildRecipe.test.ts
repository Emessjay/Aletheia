import { describe, expect, it } from "vitest";
import {
  REPO_URL,
  buildMacRecipe,
  sqlitePackIdsForBuild,
  wantsAudioPack,
  type OptionalBuildPackId,
} from "./buildRecipe";

function set(...ids: OptionalBuildPackId[]): Set<OptionalBuildPackId> {
  return new Set(ids);
}

describe("sqlitePackIdsForBuild", () => {
  it("always includes base and only selected sqlite packs", () => {
    expect(sqlitePackIdsForBuild(set())).toEqual(["base"]);
    expect(sqlitePackIdsForBuild(set("commentaries", "audio-modern-en"))).toEqual([
      "base",
      "commentaries",
    ]);
    expect(
      sqlitePackIdsForBuild(set("interlinear", "anf", "npnf", "reformers")),
    ).toEqual(["base", "interlinear", "anf", "npnf", "reformers"]);
  });
});

describe("wantsAudioPack", () => {
  it("is true only when audio-modern-en is selected", () => {
    expect(wantsAudioPack(set())).toBe(false);
    expect(wantsAudioPack(set("commentaries"))).toBe(false);
    expect(wantsAudioPack(set("audio-modern-en"))).toBe(true);
  });
});

describe("buildMacRecipe", () => {
  it("clones the public repo and always packs base", () => {
    const script = buildMacRecipe(set());
    expect(script).toContain(`git clone ${REPO_URL}`);
    expect(script).toContain("npm run pack-corpus -- --packs base");
    expect(script).toContain("npm run tauri build");
    expect(script).not.toContain("fetch-audio-pack");
  });

  it("includes selected sqlite packs and the audio fetch when checked", () => {
    const script = buildMacRecipe(set("interlinear", "commentaries", "audio-modern-en"));
    expect(script).toContain(
      "npm run pack-corpus -- --packs base interlinear commentaries",
    );
    expect(script).toContain("npm run fetch-audio-pack");
  });
});
