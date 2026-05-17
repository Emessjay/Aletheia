import type { CorpusLanguage } from "@/db/types";

/**
 * A "side" is the user-visible bucket an annotation is scoped to. The corpus
 * exposes more than four languages (en_bsb, en_web, en_kjv, he, gk, en_brenton,
 * la), but the reader only surfaces four primary sides — Modern English, King
 * James English, Hebrew, Greek — so highlights and bookmarks are scoped at that
 * granularity. en_bsb (protocanonical) and en_web (deuterocanon) both fold into
 * "en_modern" because the sidebar already presents them as one "English
 * (Modern)" stream.
 *
 * Stored in `highlights.translation` and `bookmarks.translation` as the side
 * key string. `null` continues to mean "universal" (legacy verse-level
 * highlights without a side).
 */
export type SideKey = "en_modern" | "en_kjv" | "he" | "gk";

export const SIDE_KEYS: readonly SideKey[] = [
  "en_modern",
  "en_kjv",
  "he",
  "gk",
];

export const SIDE_LABELS: Record<SideKey, string> = {
  en_modern: "Modern English",
  en_kjv: "King James English",
  he: "Hebrew",
  gk: "Greek",
};

/**
 * Map a corpus language to its side. Languages outside the four primary sides
 * (en_brenton, la) return null — annotations made against them stay tagged
 * with the raw language string and only match their own column.
 */
export function sideOf(lang: CorpusLanguage): SideKey | null {
  switch (lang) {
    case "en_bsb":
    case "en_web":
      return "en_modern";
    case "en_kjv":
      return "en_kjv";
    case "he":
      return "he";
    case "gk":
      return "gk";
    default:
      return null;
  }
}
