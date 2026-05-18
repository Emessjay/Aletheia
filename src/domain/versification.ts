import type { CorpusLanguage } from "@/db/types";
import type { Tab } from "@/domain/tabs";

/**
 * LXX↔MT versification remap.
 *
 * A handful of OT books — Jeremiah most dramatically, but also Psalms, Daniel,
 * and Esther — use one chapter-and-verse scheme in the LXX (and its English
 * descendants, Brenton + NETS) and a different one in the MT (and its English
 * descendants, KJV/BSB/WEB). In Jeremiah the chapters are reordered: LXX 26 =
 * MT 46 (Egypt), LXX 27 = MT 50 (Babylon), LXX 33-51 = MT 26-44 (with a
 * +7 offset), and so on.
 *
 * When the reader shows a Greek/LXX column side-by-side with an MT-versified
 * column (KJV, BSB, WEB, or Hebrew), readers naturally expect "chapter N" to
 * mean the same content on both sides. We honor that by remapping the
 * LXX-versified columns (`gk`, `en_brenton`) to MT chapter/verse numbering at
 * query time, while leaving interlinear mode and Greek-alone reading on
 * native LXX numbering.
 *
 * Mapping data follows the scholarly consensus (Tov 1981, Pietersma-Wright
 * NETS introduction, Rahlfs-Hanhart apparatus) on Jeremiah's LXX→MT
 * correspondence. Within a remapped chapter, the LXX verses are inserted at
 * their MT-side numbers via the per-segment `dstVerseOffset`; the grid
 * naturally renders empty cells where one tradition has plus material and the
 * other doesn't (e.g. MT 33:14-26 has no LXX parallel — those rows show
 * English without a Greek match).
 *
 * Currently scoped to Jeremiah. Psalms (LXX 9-10 = MT 9, etc.) and
 * Daniel/Esther (Greek additions) are known divergent books that should be
 * added later; the infrastructure here generalizes to them by registering
 * additional entries in `VERSIFICATION_MAPS`.
 */

export interface MTSegment {
  /** LXX chapter number to pull verses from. */
  srcChapter: number;
  /** First LXX verse to include (inclusive). */
  srcVerseStart: number;
  /** Last LXX verse to include (inclusive). Use `Infinity` for "to end". */
  srcVerseEnd: number;
  /** Added to the LXX verse number to produce the MT verse number. */
  dstVerseOffset: number;
}

const JEREMIAH_MT_TO_LXX: Record<number, MTSegment[]> = {
  // MT 1-24 and MT 52 are identity-mapped to LXX 1-24 and LXX 52; no entry
  // means "no remap needed" and getChapter falls through to the native fetch.
  25: [
    // LXX 25:1-13 → MT 25:1-13 (cup of wrath, identical text).
    { srcChapter: 25, srcVerseStart: 1, srcVerseEnd: 13, dstVerseOffset: 0 },
    // MT 25:14 is a Hebrew plus ("for many nations and great kings shall make
    // slaves of even them") with no clean LXX parallel — left empty on the
    // Greek side.
    // LXX 32:1-24 → MT 25:15-38 (continuation of cup of wrath; the LXX moves
    // this block to ch 32 and inserts the Oracles Against the Nations in the
    // gap).
    { srcChapter: 32, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 14 },
  ],

  // MT 26-45 ≈ LXX 33-51 (+7 chapter offset, verse-aligned within each chapter
  // when verse counts match; the LXX is generally shorter for the plus
  // material of MT, leaving trailing MT verses without a Greek counterpart).
  26: [{ srcChapter: 33, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  27: [{ srcChapter: 34, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  28: [{ srcChapter: 35, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  29: [{ srcChapter: 36, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  30: [{ srcChapter: 37, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  31: [{ srcChapter: 38, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  32: [{ srcChapter: 39, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  33: [{ srcChapter: 40, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  34: [{ srcChapter: 41, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  35: [{ srcChapter: 42, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  36: [{ srcChapter: 43, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  37: [{ srcChapter: 44, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  38: [{ srcChapter: 45, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  39: [{ srcChapter: 46, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  40: [{ srcChapter: 47, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  41: [{ srcChapter: 48, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  42: [{ srcChapter: 49, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  43: [{ srcChapter: 50, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  // LXX 51 spans MT 44 + the very short MT 45 (prophecy to Baruch).
  44: [{ srcChapter: 51, srcVerseStart: 1, srcVerseEnd: 30, dstVerseOffset: 0 }],
  45: [{ srcChapter: 51, srcVerseStart: 31, srcVerseEnd: 35, dstVerseOffset: -30 }],

  // Oracles Against the Nations: LXX gathers them in chs 26-31; MT scatters
  // them across chs 46-51.
  46: [{ srcChapter: 26, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }], // Egypt
  47: [{ srcChapter: 29, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }], // Philistia
  48: [{ srcChapter: 31, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }], // Moab
  // MT 49 collects oracles against Ammon, Edom, Damascus, Kedar/Hazor, Elam.
  // LXX 30 covers most of those (in a different internal order); the Elam
  // oracle alone was already lifted into LXX 25:14-20 ahead of the rest of
  // the OAN block. Verse-by-verse mapping is messy; we approximate with the
  // whole of LXX 30 starting at MT 49:1, which puts related material in the
  // same chapter even if individual verse rows don't always align.
  49: [{ srcChapter: 30, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }],
  50: [{ srcChapter: 27, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }], // Babylon
  51: [{ srcChapter: 28, srcVerseStart: 1, srcVerseEnd: Infinity, dstVerseOffset: 0 }], // Babylon (cont.)
};

export const VERSIFICATION_MAPS: Record<string, Record<number, MTSegment[]>> = {
  jer: JEREMIAH_MT_TO_LXX,
};

const LXX_VERSIFIED: ReadonlySet<CorpusLanguage> = new Set<CorpusLanguage>([
  "gk",
  "en_brenton",
]);

const MT_VERSIFIED: ReadonlySet<CorpusLanguage> = new Set<CorpusLanguage>([
  "he",
  "en_bsb",
  "en_kjv",
  "en_web",
]);

export function isLXXVersified(lang: CorpusLanguage): boolean {
  return LXX_VERSIFIED.has(lang);
}

export function isMTVersified(lang: CorpusLanguage): boolean {
  return MT_VERSIFIED.has(lang);
}

/**
 * True when the active tab layout pairs an LXX-versified single column (`gk`
 * or `en_brenton`) with an MT-versified single column (`he`, `en_bsb`,
 * `en_kjv`, `en_web`). In that mode the reader renders all columns under MT
 * numbering — LXX-versified columns get remapped via [[VERSIFICATION_MAPS]].
 *
 * Interlinear tabs are intentionally excluded: their two languages are bound
 * to a single per-word stack on the primary's native versification, so a
 * Greek+English interlinear stays on LXX numbers regardless of what other
 * tabs are active.
 */
export function activeTabsRequireMTRemap(activeTabs: Tab[]): boolean {
  let hasLXXSingle = false;
  let hasMTSingle = false;
  for (const t of activeTabs) {
    if (t.kind !== "single") continue;
    if (isLXXVersified(t.lang)) hasLXXSingle = true;
    else if (isMTVersified(t.lang)) hasMTSingle = true;
  }
  return hasLXXSingle && hasMTSingle;
}

/**
 * Look up the LXX source ranges that compose an MT chapter for a divergent
 * book. Returns null when the book has no map (use native versification) or
 * when the chapter is identity-mapped (e.g. MT Jer 1 = LXX Jer 1).
 */
export function getMTSegments(
  bookSlug: string,
  mtChapter: number,
): MTSegment[] | null {
  const map = VERSIFICATION_MAPS[bookSlug];
  if (!map) return null;
  return map[mtChapter] ?? null;
}
