import { describe, expect, it } from "vitest";
import {
  CORPUS_HF_REPO,
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
  it("bootstraps missing prerequisites before cloning", () => {
    const script = buildMacRecipe(set());
    expect(script).toContain("xcode-select --install");
    expect(script).toContain("Homebrew/install/HEAD/install.sh");
    expect(script).toContain("brew install node@20");
    expect(script).toContain("https://sh.rustup.rs");
    expect(script).toContain(`git clone ${REPO_URL}`);
    expect(script).toContain(CORPUS_HF_REPO);
    expect(script).toContain("requirements-corpus.txt");
    expect(script).toContain(
      "npm run fetch-corpus-packs -- --channel production --packs base",
    );
    expect(script).toContain("npm run tauri build");
    expect(script).not.toContain("fetch_sources.sh");
    expect(script).not.toContain("pack-corpus");
  });

  it("includes selected packs in the production HF fetch list", () => {
    const script = buildMacRecipe(set("interlinear", "commentaries", "audio-modern-en"));
    expect(script).toContain(
      "npm run fetch-corpus-packs -- --channel production --packs base interlinear commentaries audio-modern-en",
    );
    expect(script).not.toContain("fetch-audio-pack");
  });
});
