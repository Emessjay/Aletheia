import type { CorpusLanguage, StrongsRow, WordRow } from "@/db/types";
import { lookupByGreekSurface } from "@/domain/greekNormalize";
import { translationShortLabel } from "@/domain/translations";

/** Languages that can sit on top of an interlinear stack. */
export type PrimaryLang = "he" | "gk" | "en_bsb";
/** Languages that can sit under the primary (the dragged-on secondary). */
export type SecondaryLang = "en_bsb" | "en_kjv" | "he" | "gk";

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

/**
 * Given two single-tab languages from a drag-merge, decide whether they form
 * a valid interlinear pair.
 *
 * **Roles follow drag direction:** `target` (drop destination) becomes
 * primary; `dragged` (the tab being dragged onto it) becomes secondary.
 *
 * Valid pairs:
 * - Primary `he`|`gk` + secondary `en_bsb`|`en_kjv` — original on top,
 *   STEPBible BSB-derived English underneath (same undertext for BSB and KJV).
 * - Primary `en_bsb` + secondary `he`|`gk` — Modern English on top, original
 *   underneath via BSB Translation Tables (English reading order).
 *
 * Invalid: he+gk, en_bsb+en_kjv, en_kjv as English-primary, anything else.
 */
export function resolveInterlinear(
  dragged: CorpusLanguage,
  target: CorpusLanguage,
): { primary: PrimaryLang; secondary: SecondaryLang } | null {
  if (dragged === target) return null;

  if (
    (target === "he" || target === "gk") &&
    (dragged === "en_bsb" || dragged === "en_kjv")
  ) {
    return { primary: target, secondary: dragged };
  }

  if (target === "en_bsb" && (dragged === "he" || dragged === "gk")) {
    return { primary: "en_bsb", secondary: dragged };
  }

  return null;
}

export function isOriginalPrimary(primary: PrimaryLang): primary is "he" | "gk" {
  return primary === "he" || primary === "gk";
}

export function isEnglishPrimary(primary: PrimaryLang): primary is "en_bsb" {
  return primary === "en_bsb";
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
 * Pick the under-word text for an original-language-primary interlinear.
 *
 * Both BSB and KJV secondaries render STEPBible's per-word English translation
 * (BSB-derived from TAHOT/TAGNT col 3, stored on word.english). The pair label
 * still distinguishes the two for the parallel-column view; under-word text is
 * the same.
 *
 * Returns '' for words STEPBible left blank (untagged function words, or LXX
 * tokens that never matched an NT surface). Callers render an em-dash in that
 * case — no dictionary gloss fallback. LXX rows may carry english copied from
 * a matching NT surface at ingest (all-caps Greek casefolded in the lookup key).
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

/**
 * Resolve English undertext for a Greek surface, preferring the row's stored
 * `english` then a normalized-surface map (all-caps LXX tokens casefold before
 * lookup). Display still uses the raw surface elsewhere.
 */
export function equivalentForGreekSurface(
  english: string | null,
  surface: string,
  englishByNormalizedGreek?: ReadonlyMap<string, string>,
): string {
  const direct = equivalentFor(english);
  if (direct !== "") return direct;
  if (!englishByNormalizedGreek) return "";
  return equivalentFor(
    lookupByGreekSurface(englishByNormalizedGreek, surface) ?? null,
  );
}

/**
 * Clean BSB Translation Table English surface for English-primary interlinear.
 * Tables pad cells with spaces; bracketed inserts like `[the]` become `(the)`.
 */
export function bsbEnglishSurface(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw
    .replace(/\[/g, "(")
    .replace(/\]/g, ")")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean original-language undertext from a BSB Translation Table row
 * (stored on `word.english` for en_bsb word rows).
 */
export function bsbOriginalUndertext(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw
    .replace(/\\/g, "")
    .replace(/׃/g, "") // sof pasuq
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * For English-primary interlinear, keep only word rows whose Strong's language
 * matches the secondary (H* for Hebrew, G* for Greek). OT verses have Hebrew
 * rows; NT verses have Greek — the wrong secondary yields an empty list and
 * the UI falls back to plain BSB text.
 */
export function wordsForEnglishPrimary(
  words: WordRow[],
  secondary: SecondaryLang,
): WordRow[] {
  if (secondary !== "he" && secondary !== "gk") return [];
  const prefix = secondary === "he" ? "H" : "G";
  return words.filter((w) => (w.strongs ?? "").startsWith(prefix));
}
