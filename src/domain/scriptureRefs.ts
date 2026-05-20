// Scripture-reference detector. Scans arbitrary prose (patristic body text,
// editor footnotes, etc.) and returns the spans that look like Bible
// citations — "Rom. 1:20", "Romans 1:20-23", "Ps. 19", "Luke xv. 24",
// "1 Cor 13:4". Each detection carries the resolved book slug + chapter +
// (optional) verse so the caller can render it as a reader link.
//
// The companion to [[parseReference]]: that function parses a single
// user-typed input string that must *start* with a book name, while this
// one scans free prose and finds every occurrence.
//
// Conservative by design: false positives are worse than misses here, since
// the visible result is colored, underlined, and clickable. Two guards:
//
//   1. Book name must be Titlecase or ALLCAPS — never all-lowercase. Stops
//      "I am 5 feet" matching `am` (Amos) and "is 1" matching `is` (Isaiah).
//   2. A chapter must follow. Bare book names ("In John we read…") are
//      structurally ambiguous and we deliberately don't link them.
//
// Returned spans are non-overlapping and sorted by `start`.

import { ALIAS_INDEX, type ParsedReference } from "./reference";

export interface DetectedReference {
  start: number;
  end: number;
  text: string;
  parsed: ParsedReference;
}

const MAX_VERSE = 200;

// Per-book chapter cap. Most false positives in patristic prose are abbr
// collisions where the matched "chapter" is a footnote/letter number rather
// than a real chapter — e.g. "Ep. 34" reading as Ephesians 34 when the
// surrounding text is talking about Eusebius's *Epistle* 34. Capping at the
// real chapter count throws those out automatically.
const MAX_CHAPTER_BY_SLUG: Record<string, number> = {
  gen: 50, exod: 40, lev: 27, num: 36, deut: 34,
  josh: 24, judg: 21, ruth: 4, "1sam": 31, "2sam": 24,
  "1kgs": 22, "2kgs": 25, "1chr": 29, "2chr": 36,
  ezra: 10, neh: 13, esth: 16,
  job: 42, ps: 150, prov: 31, eccl: 12, song: 8,
  isa: 66, jer: 52, lam: 5, ezek: 48, dan: 12,
  hos: 14, joel: 3, amos: 9, obad: 1, jonah: 4, mic: 7,
  nah: 3, hab: 3, zeph: 3, hag: 2, zech: 14, mal: 4,
  matt: 28, mark: 16, luke: 24, john: 21,
  acts: 28, rom: 16, "1cor": 16, "2cor": 13, gal: 6,
  eph: 6, phil: 4, col: 4, "1thes": 5, "2thes": 3,
  "1tim": 6, "2tim": 4, titus: 3, phlm: 1,
  heb: 13, jas: 5, "1pet": 5, "2pet": 3,
  "1john": 5, "2john": 1, "3john": 1, jude: 1, rev: 22,
  "1es": 9, "2es": 16, tob: 14, jdt: 16, wis: 19, sir: 51,
  bar: 6, lje: 1, s3y: 1, sus: 1, bel: 1, man: 1,
  "1mac": 16, "2mac": 15, "3mac": 7, "4mac": 18, ps151: 1,
};

// Aliases never to detect in prose, even though the parser accepts them
// from the command palette. "Man" (Prayer of Manasseh) collides with the
// English word; the few real references aren't worth the noise.
const ALIAS_BLOCKLIST = new Set(["man"]);

// Roman-numeral chapter pattern. The regex grabs any 1–8 roman-letter run;
// `isCanonicalRoman` below filters out non-numerals like "civic" or "mix"
// that happen to live in the same character set.
const ROMAN_RE = "[ivxlcdmIVXLCDM]{1,8}";
const CANONICAL_ROMAN_RE =
  /^M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/i;

function isCanonicalRoman(s: string): boolean {
  return s.length > 0 && CANONICAL_ROMAN_RE.test(s);
}

// Map an alias regex piece back to its slug. Built once. The piece is what
// the regex actually contains (e.g. `1\s*Cor`); the key we look up against
// is the lowercased, whitespace-stripped form of the matched substring, so
// we index by the original compact alias instead.
const COMPACT_ALIAS_TO_SLUG = new Map<string, string>(
  ALIAS_INDEX.map(({ alias, slug }) => [alias, slug]),
);

/** Lowercase + strip whitespace and punctuation so "1 Cor." → "1cor". */
function compactAlias(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Title-case a letters-only string ("rom" → "Rom"). */
function titleCase(letters: string): string {
  if (letters.length === 0) return letters;
  return letters[0].toUpperCase() + letters.slice(1).toLowerCase();
}

/** Build the alternation that matches any known book alias in real prose.
 *  Each alias yields two patterns: title-cased and all-uppercase. Numeric
 *  prefixes ("1", "2", "3", "4") are detached so "1 Cor" and "1Cor" both
 *  match. Sorted longest-first so "Romans" wins over "Rom". */
function buildBookPattern(): string {
  const pieces: string[] = [];
  const seen = new Set<string>();
  for (const { alias } of ALIAS_INDEX) {
    if (ALIAS_BLOCKLIST.has(alias)) continue;
    const m = alias.match(/^(\d)?([a-z]+)$/);
    if (!m) continue;
    const digit = m[1] ?? "";
    const letters = m[2];
    const sep = digit ? "\\s*" : "";
    const title = digit + sep + titleCase(letters);
    const upper = digit + sep + letters.toUpperCase();
    for (const variant of [title, upper]) {
      if (!seen.has(variant)) {
        seen.add(variant);
        pieces.push(variant);
      }
    }
  }
  // Sort longest first so "Romans" wins the alternation race against "Rom".
  pieces.sort((a, b) => b.length - a.length);
  return pieces.join("|");
}

const BOOK_PATTERN = buildBookPattern();

// Two capture-groups carry the chapter, one arabic and one roman, with a
// shared optional verse + range tail. Wrapping each branch in non-capturing
// `(?:…)` keeps the chapter/verse group indices stable.
//
// The trailing `\b` on every numeric tail prevents a leading "1:1" inside a
// longer "1:12" from being misread as a partial reference.
const REF_RE = new RegExp(
  String.raw`(\b(?:` +
    BOOK_PATTERN +
    String.raw`))\.?\s+(?:(\d{1,3})(?:\s*[:.]\s*(\d{1,3})(?:\s*[-–—]\s*\d{1,3})?)?\b|(` +
    ROMAN_RE +
    String.raw`)\b(\.?)(?:\s+(\d{1,3})(?:\s*[-–—]\s*\d{1,3})?\b)?)`,
  "g",
);

/** Convert a Roman numeral to its integer value. Returns NaN on garbage. */
export function romanToInt(s: string): number {
  if (!s) return NaN;
  const map: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
  };
  const up = s.toUpperCase();
  let total = 0;
  for (let i = 0; i < up.length; i++) {
    const v = map[up[i]];
    if (!v) return NaN;
    const next = map[up[i + 1]] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

/** Find every scripture reference in `text`. Spans are non-overlapping
 *  and sorted by start position; the regex's left-to-right greedy match
 *  naturally guarantees that. */
export function findScriptureReferences(text: string): DetectedReference[] {
  if (!text) return [];
  const out: DetectedReference[] = [];
  REF_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(text)) !== null) {
    const [whole, bookRaw, arabicChapter, arabicVerse, romanChapter, romanPeriod, romanVerse] = m;
    const slug = COMPACT_ALIAS_TO_SLUG.get(compactAlias(bookRaw));
    if (!slug) continue;

    let chapter: number;
    let verse: number | null = null;
    if (arabicChapter !== undefined) {
      chapter = Number(arabicChapter);
      verse = arabicVerse !== undefined ? Number(arabicVerse) : null;
    } else if (romanChapter !== undefined) {
      if (!isCanonicalRoman(romanChapter)) continue;
      // A bare single-letter Roman ("I", "V", "X") after a book is too easy
      // to confuse with the English pronoun "I" or a list marker: "Am I" is
      // the obvious failure mode. Require a disambiguating period or a
      // following verse number to accept it.
      if (romanChapter.length === 1 && !romanPeriod && romanVerse === undefined) {
        continue;
      }
      chapter = romanToInt(romanChapter);
      verse = romanVerse !== undefined ? Number(romanVerse) : null;
    } else {
      continue;
    }

    const maxChapter = MAX_CHAPTER_BY_SLUG[slug] ?? 200;
    if (!Number.isFinite(chapter)) continue;
    // Single-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude, Jude,
    // Epistle of Jeremiah, Susanna, Bel, Prayer of Manasseh): patristic
    // editors customarily write "3 John 9" or "Jude 14" to mean
    // *verse* 9 / 14 of the single chapter, not chapter 9. Without this
    // remap the citation would fail the chapter-cap check and never link.
    if (maxChapter === 1 && verse === null && chapter >= 1) {
      verse = chapter;
      chapter = 1;
    }
    if (chapter < 1 || chapter > maxChapter) continue;
    if (verse !== null && (!Number.isFinite(verse) || verse < 1 || verse > MAX_VERSE)) {
      verse = null;
    }

    out.push({
      start: m.index,
      end: m.index + whole.length,
      text: whole,
      parsed: {
        bookSlug: slug,
        chapter,
        verse,
        href: verse !== null
          ? `/reader/bible/${slug}/${chapter}#v${verse}`
          : `/reader/bible/${slug}/${chapter}`,
      },
    });
  }
  return out;
}
