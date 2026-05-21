import type { CorpusLanguage, StrongsRow } from "@/db/types";
import { translationShortLabel } from "@/domain/translations";

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
  const p = translationShortLabel(primary);
  const s = translationShortLabel(secondary);
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
 * Both BSB and KJV pairs render STEPBible's per-word English translation
 * (BSB-derived from TAHOT/TAGNT col 3, stored on word.english). The KJV pair
 * previously fell back to a kjv_usage-derived dictionary gloss when no
 * alignment existed; that fallback was removed when the KJV pair reached
 * parity with BSB. The pair label still distinguishes the two for the
 * parallel-column view; under-word text is the same.
 *
 * Returns '' for words STEPBible left blank (LXX surface tokens, untagged
 * function words). Callers render an em-dash in that case — no dictionary
 * fallback.
 */
export function equivalentFor(english: string | null): string {
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
