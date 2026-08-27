/**
 * User-facing Bible canon tradition. The corpus stores every KJV-Apocrypha /
 * WEB-deuterocanon book under testament `"deutero"`; this module only decides
 * whether each of those books is labeled Deuterocanon or Apocrypha in the UI.
 *
 * Protocanonical OT/NT books are never reclassified.
 */

export type CanonTradition = "protestant" | "catholic" | "orthodox";

/** How a corpus `testament === "deutero"` book is labeled under a tradition. */
export type ExtraBookClass = "deuterocanon" | "apocrypha";

export const CANON_TRADITIONS: CanonTradition[] = [
  "protestant",
  "catholic",
  "orthodox",
];

export const CANON_TRADITION_META: Record<
  CanonTradition,
  { label: string; shortLabel: string; description: string }
> = {
  protestant: {
    label: "Protestant",
    shortLabel: "Protestant",
    description:
      "The 66-book canon. Extra books in the corpus are labeled Apocrypha.",
  },
  catholic: {
    label: "Catholic",
    shortLabel: "Catholic",
    description:
      "Council of Trent deuterocanon. Remaining extras are labeled Apocrypha.",
  },
  orthodox: {
    label: "Eastern Orthodox",
    shortLabel: "Orthodox",
    description:
      "Broader Eastern Orthodox deuterocanon. Remaining extras are Apocrypha.",
  },
};

/**
 * Catholic deuterocanon (Trent), keyed by the same BSB/WEB/KJV-apocrypha slugs
 * the corpus uses. Greek Esther additions live inside Esther (OT), so they are
 * not listed here.
 */
const CATHOLIC_DEUTERO: ReadonlySet<string> = new Set([
  "tob",
  "jdt",
  "wis",
  "sir",
  "bar",
  "lje",
  "s3y",
  "sus",
  "bel",
  "1mac",
  "2mac",
]);

/**
 * Eastern Orthodox deuterocanon commonly includes the Catholic set plus
 * 1 Esdras, Prayer of Manasseh, 3 Maccabees, and Psalm 151. 2 Esdras and
 * 4 Maccabees remain labeled Apocrypha (appendix / non-canonical in most
 * Orthodox usage).
 */
const ORTHODOX_DEUTERO: ReadonlySet<string> = new Set([
  ...CATHOLIC_DEUTERO,
  "1es",
  "man",
  "3mac",
  "ps151",
]);

export function isCanonTradition(v: unknown): v is CanonTradition {
  return v === "protestant" || v === "catholic" || v === "orthodox";
}

/**
 * Classify a book slug that lives in the corpus deutero section.
 * Unknown slugs default to apocrypha so a future corpus addition stays safe.
 */
export function classifyExtraBook(
  slug: string,
  tradition: CanonTradition,
): ExtraBookClass {
  if (tradition === "protestant") return "apocrypha";
  if (tradition === "catholic") {
    return CATHOLIC_DEUTERO.has(slug) ? "deuterocanon" : "apocrypha";
  }
  return ORTHODOX_DEUTERO.has(slug) ? "deuterocanon" : "apocrypha";
}
