import type { CorpusLanguage, StrongsRow } from "@/db/types";

export type PrimaryLang = "he" | "gk";
export type SecondaryLang = "en_bsb" | "en_kjv";

export interface SingleTab {
  kind: "single";
  lang: CorpusLanguage;
  active: boolean;
}

export interface InterlinearTab {
  kind: "interlinear";
  primary: PrimaryLang;
  secondary: SecondaryLang;
  active: boolean;
}

export type Tab = SingleTab | InterlinearTab;

const PRIMARY_RANK: Record<string, number> = {
  he: 0,
  gk: 1,
  en_kjv: 2,
  en_bsb: 3,
};

/**
 * Given two toggleable languages, decide whether they can form an interlinear
 * pair and which is primary. Returns null when no per-word data exists on
 * either side (he+gk, en_bsb+en_kjv) or when a language is not toggleable.
 *
 * Precedence (primary wins): he > gk > en_kjv > en_bsb.
 * Only pairs of (he|gk) × (en_bsb|en_kjv) are valid; primary must be he|gk.
 */
export function resolveInterlinear(
  a: CorpusLanguage,
  b: CorpusLanguage,
): { primary: PrimaryLang; secondary: SecondaryLang } | null {
  if (a === b) return null;
  const ra = PRIMARY_RANK[a];
  const rb = PRIMARY_RANK[b];
  if (ra === undefined || rb === undefined) return null;
  const [hi, lo] = ra < rb ? [a, b] : [b, a];
  if (hi !== "he" && hi !== "gk") return null;
  if (lo !== "en_bsb" && lo !== "en_kjv") return null;
  return { primary: hi, secondary: lo };
}

export function interlinearLabel(
  primary: PrimaryLang,
  secondary: SecondaryLang,
): string {
  const p = primary === "he" ? "Hebrew" : "Greek";
  const s = secondary === "en_kjv" ? "King James English" : "English";
  return `Interlinear (${p} + ${s})`;
}

/**
 * Pick the gloss shown under a primary word in an interlinear column.
 *
 * For BSB pairs we use the lexical gloss as-is (one short dictionary phrase).
 * For KJV pairs we use the first comma-separated entry of kjv_usage so the
 * underword text matches KJV vocabulary — e.g. G3056 renders "account" instead
 * of the generic "something said".
 */
export function glossFor(
  row: StrongsRow | undefined,
  secondary: SecondaryLang,
): string {
  if (!row) return "";
  if (secondary === "en_kjv" && row.kjv_usage) {
    const first = row.kjv_usage.split(",")[0]?.trim() ?? "";
    const cleaned = first.replace(/\.$/, "").replace(/^\+\s*/, "").replace(/^×\s*/i, "").trim();
    if (cleaned.length > 0) return cleaned;
  }
  return row.gloss ?? "";
}
