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

/**
 * Pick the under-word text for an interlinear column.
 *
 * BSB pair: reverse-interlinear mode — show the actual verse-specific English
 * equivalent for this Hebrew/Greek word, sourced from STEPBible TAHOT/TAGNT
 * column 3 (BSB-derived per-word translation, stored on `word.english`). When
 * no alignment exists (e.g. LXX tokens, untagged words) we return the empty
 * string so the caller can render an em-dash — we do NOT fall back to the
 * dictionary gloss.
 *
 * KJV pair: dictionary-gloss mode (today). STEPBible doesn't publish a tagged
 * KJV, and no other PD/CC-BY tagged-KJV source has materialised, so we still
 * surface `glossFor`'s kjv_usage-derived gloss. If a tagged KJV is sourced
 * later, this branch can switch to a real KJV `english` field on word rows.
 */
export function equivalentFor(
  english: string | null,
  strongsRow: StrongsRow | undefined,
  secondary: SecondaryLang,
): string {
  if (secondary === "en_kjv") return glossFor(strongsRow, secondary);
  if (english == null) return "";
  // STEPBible splits Hebrew morpheme compounds (prefix + root) with a slash on
  // both surface and translation sides, e.g. הַ/שָּׁמַיִם → "the/ heavens".
  // InterlinearWord.clean strips the slash on the Hebrew side; mirror that here
  // by collapsing slashes to a single space. Angle-bracket placeholders
  // (<obj.>, <the>) read better as parentheses.
  return english
    .replace(/\//g, " ")
    .replace(/</g, "(")
    .replace(/>/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}
