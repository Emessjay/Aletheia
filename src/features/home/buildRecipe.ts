// Generates a Mac build script from optional corpus-pack selections.
// Base is always included; audio is a separate fetch (not a SQLite pack).

import {
  CORPUS_PACKS,
  type CorpusPackId,
} from "@/domain/corpusPacks";

export const REPO_URL = "https://github.com/Emessjay/Aletheia.git";

/** Optional packs the homepage exposes as checkboxes (everything but base). */
export const OPTIONAL_BUILD_PACKS = CORPUS_PACKS.filter((p) => p.kind !== "base");

export type OptionalBuildPackId = Exclude<CorpusPackId, "base">;

export function isOptionalBuildPackId(id: string): id is OptionalBuildPackId {
  return OPTIONAL_BUILD_PACKS.some((p) => p.id === id);
}

/** SQLite shards to pass to `split-corpus-packs.py --packs …` (always includes base). */
export function sqlitePackIdsForBuild(
  selected: ReadonlySet<OptionalBuildPackId>,
): CorpusPackId[] {
  const ids: CorpusPackId[] = ["base"];
  for (const pack of OPTIONAL_BUILD_PACKS) {
    if (pack.kind === "sqlite" && selected.has(pack.id as OptionalBuildPackId)) {
      ids.push(pack.id);
    }
  }
  return ids;
}

export function wantsAudioPack(
  selected: ReadonlySet<OptionalBuildPackId>,
): boolean {
  return selected.has("audio-modern-en");
}

/**
 * Shell script a visitor can copy to clone, pack the selected corpus shards,
 * optionally fetch narration MP3s, and produce a macOS Tauri bundle.
 */
export function buildMacRecipe(
  selected: ReadonlySet<OptionalBuildPackId>,
): string {
  const sqlitePacks = sqlitePackIdsForBuild(selected);
  const packList = sqlitePacks.join(" ");
  const lines: string[] = [
    "# Prerequisites: Node 20+, Rust (rustup), Xcode Command Line Tools,",
    "# and Swift (for the one-time corpus ingest).",
    "",
    `git clone ${REPO_URL}`,
    "cd Aletheia",
    "npm install",
    "",
    "# Fetch public-domain sources and build the corpus SQLite once:",
    "./scripts/fetch_sources.sh",
    "cd tools/ingest",
    "swift run aletheia-ingest \\",
    "  --source-root ../../data/sources \\",
    "  --output ../../data/Aletheia.sqlite",
    "cd ../..",
    "",
    "# Split the monolith into the packs you selected:",
    `npm run pack-corpus -- --packs ${packList}`,
  ];

  if (wantsAudioPack(selected)) {
    lines.push(
      "",
      "# Offline narration MP3s (~8 GB; resumable):",
      "npm run fetch-audio-pack",
    );
  }

  lines.push(
    "",
    "# Production macOS app (output under src-tauri/target/release/bundle/):",
    "npm run tauri build",
  );

  return lines.join("\n");
}
