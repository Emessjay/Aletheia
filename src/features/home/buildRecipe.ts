// Generates a Mac build script from optional corpus-pack selections.
// Base is always included; audio is a separate fetch (not a SQLite pack).

import {
  CORPUS_PACKS,
  type CorpusPackId,
} from "@/domain/corpusPacks";

export const REPO_URL = "https://github.com/Emessjay/Aletheia.git";

/** Hugging Face dataset hosting pinned corpus pack artifacts. */
export const CORPUS_HF_REPO = "Emessjay/aletheia-corpus";

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
 * Bootstrap block: install CLT / Homebrew / Node 20+ / Rust when missing.
 * Plain string (not a template literal) so shell `$…` / `$(…)` stay literal.
 */
export const PREREQ_BOOTSTRAP = [
  "set -euo pipefail",
  "",
  'echo "==> Checking build prerequisites…"',
  "",
  "# Xcode Command Line Tools (git, clang, Swift). Opens a GUI installer when missing.",
  "if ! xcode-select -p >/dev/null 2>&1; then",
  '  echo "Installing Xcode Command Line Tools (Apple\'s GUI installer will open)…"',
  "  xcode-select --install || true",
  '  echo "Finish that installer, then re-run this script."',
  "  exit 1",
  "fi",
  "",
  "# Homebrew — used to install Node when needed.",
  "if ! command -v brew >/dev/null 2>&1; then",
  '  echo "Installing Homebrew…"',
  '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
  "  if [ -x /opt/homebrew/bin/brew ]; then",
  '    eval "$(/opt/homebrew/bin/brew shellenv)"',
  "  elif [ -x /usr/local/bin/brew ]; then",
  '    eval "$(/usr/local/bin/brew shellenv)"',
  "  fi",
  "fi",
  "",
  "# Node 20+ (npm comes with it).",
  "need_node=0",
  "if ! command -v node >/dev/null 2>&1; then",
  "  need_node=1",
  "else",
  '  node_major="$(node -v | sed -E \'s/^v([0-9]+).*/\\1/\')"',
  '  if [ "$node_major" -lt 20 ]; then',
  "    need_node=1",
  "  fi",
  "fi",
  'if [ "$need_node" -eq 1 ]; then',
  '  echo "Installing Node.js 20 via Homebrew…"',
  "  brew install node@20",
  "  brew link --overwrite --force node@20",
  "fi",
  "",
  "# Rust toolchain (rustc + cargo) via rustup.",
  "if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then",
  '  echo "Installing Rust via rustup…"',
  "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
  "  # shellcheck disable=SC1091",
  '  . "$HOME/.cargo/env"',
  "fi",
  "",
  'echo "==> Prerequisites OK (node $(node -v), rustc $(rustc --version | awk \'{print $2}\')).',
].join("\n");

/**
 * Shell script a visitor can copy to install missing prerequisites, clone,
 * download pinned production corpus packs from Hugging Face Hub, and produce a
 * macOS Tauri bundle.
 */
export function buildMacRecipe(
  selected: ReadonlySet<OptionalBuildPackId>,
): string {
  const fetchPacks = [...sqlitePackIdsForBuild(selected)];
  if (wantsAudioPack(selected)) {
    fetchPacks.push("audio-modern-en");
  }
  const packList = fetchPacks.join(" ");
  const lines: string[] = [
    "# Aletheia — build for Mac",
    "# Installs missing prerequisites (Xcode CLT, Homebrew, Node 20+, Rust),",
    `# then clones, fetches production corpus packs from Hugging Face (${CORPUS_HF_REPO}),`,
    "# and produces a Tauri app bundle.",
    "# Paste into Terminal, or: bash build-aletheia.sh",
    "",
    PREREQ_BOOTSTRAP,
    "",
    `git clone ${REPO_URL}`,
    "cd Aletheia",
    "npm install",
    "",
    "# Production corpus (modular packs, SHA-256 verified):",
    "python3 -m pip install -q -r scripts/requirements-corpus.txt",
    `npm run fetch-corpus-packs -- --channel production --packs ${packList}`,
    "",
    "# Production macOS app (output under src-tauri/target/release/bundle/):",
    "npm run tauri build",
  ];

  return lines.join("\n");
}
