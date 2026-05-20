// Reference parser. Accepts strings like "John 3:16", "Gen 1:1", "1 Cor 13",
// "ps 23.4", "Matt 5". Returns the matched book slug + chapter (+ optional verse),
// or null if the input doesn't look like a reference.
//
// The book lookup table is hand-curated so the parser doesn't need a corpus
// round-trip. Slugs match BSB; deuterocanonical entries map to KJV-with-apocrypha
// slugs. Ordering matters: longer aliases must be tried before their shorter
// prefixes (e.g. "1cor" before "1c").

interface BookEntry {
  slug: string;
  // Lowercased, whitespace/punctuation-stripped aliases.
  aliases: string[];
}

// Each entry is { slug, [aliases] }. Aliases include the full name, the short
// abbreviation, and common alternatives.
const BOOKS: BookEntry[] = [
  // Pentateuch
  { slug: "gen", aliases: ["genesis", "gen", "gn"] },
  { slug: "exod", aliases: ["exodus", "exod", "exo", "ex"] },
  { slug: "lev", aliases: ["leviticus", "lev", "lv"] },
  { slug: "num", aliases: ["numbers", "num", "nm", "nb"] },
  { slug: "deut", aliases: ["deuteronomy", "deut", "deu", "dt"] },
  // Historical
  { slug: "josh", aliases: ["joshua", "josh", "jos"] },
  { slug: "judg", aliases: ["judges", "judg", "jdg"] },
  { slug: "ruth", aliases: ["ruth", "ru", "rt"] },
  { slug: "1sam", aliases: ["1samuel", "1sam", "1sm", "1s"] },
  { slug: "2sam", aliases: ["2samuel", "2sam", "2sm", "2s"] },
  { slug: "1kgs", aliases: ["1kings", "1kgs", "1kg", "1k"] },
  { slug: "2kgs", aliases: ["2kings", "2kgs", "2kg", "2k"] },
  { slug: "1chr", aliases: ["1chronicles", "1chr", "1ch"] },
  { slug: "2chr", aliases: ["2chronicles", "2chr", "2ch"] },
  { slug: "ezra", aliases: ["ezra", "ezr"] },
  { slug: "neh", aliases: ["nehemiah", "neh", "ne"] },
  { slug: "esth", aliases: ["esther", "esth", "est"] },
  // Wisdom
  { slug: "job", aliases: ["job", "jb"] },
  { slug: "ps", aliases: ["psalms", "psalm", "ps", "psa", "pss"] },
  { slug: "prov", aliases: ["proverbs", "prov", "pro", "pr", "prv"] },
  { slug: "eccl", aliases: ["ecclesiastes", "eccl", "ecc", "ec", "qoh"] },
  { slug: "song", aliases: ["songofsongs", "songofsolomon", "song", "sos", "ss", "canticles"] },
  // Major prophets
  { slug: "isa", aliases: ["isaiah", "isa", "is"] },
  { slug: "jer", aliases: ["jeremiah", "jer", "je"] },
  { slug: "lam", aliases: ["lamentations", "lam", "la"] },
  { slug: "ezek", aliases: ["ezekiel", "ezek", "eze", "ezk"] },
  { slug: "dan", aliases: ["daniel", "dan", "dn"] },
  // Minor prophets
  { slug: "hos", aliases: ["hosea", "hos", "ho"] },
  { slug: "joel", aliases: ["joel", "joe", "jl"] },
  { slug: "amos", aliases: ["amos", "am"] },
  { slug: "obad", aliases: ["obadiah", "obad", "oba", "ob"] },
  { slug: "jonah", aliases: ["jonah", "jon", "jnh"] },
  { slug: "mic", aliases: ["micah", "mic", "mi"] },
  { slug: "nah", aliases: ["nahum", "nah", "na"] },
  { slug: "hab", aliases: ["habakkuk", "hab", "hb"] },
  { slug: "zeph", aliases: ["zephaniah", "zeph", "zep", "zp"] },
  { slug: "hag", aliases: ["haggai", "hag", "hg"] },
  { slug: "zech", aliases: ["zechariah", "zech", "zec", "zc"] },
  { slug: "mal", aliases: ["malachi", "mal", "ml"] },
  // Gospels
  { slug: "matt", aliases: ["matthew", "matt", "mat", "mt"] },
  { slug: "mark", aliases: ["mark", "mar", "mk", "mrk"] },
  { slug: "luke", aliases: ["luke", "luk", "lk"] },
  { slug: "john", aliases: ["john", "jhn", "jn"] },
  // History
  { slug: "acts", aliases: ["acts", "act", "ac"] },
  // Pauline
  { slug: "rom", aliases: ["romans", "rom", "ro", "rm"] },
  { slug: "1cor", aliases: ["1corinthians", "1cor", "1co", "1c"] },
  { slug: "2cor", aliases: ["2corinthians", "2cor", "2co", "2c"] },
  { slug: "gal", aliases: ["galatians", "gal", "ga"] },
  { slug: "eph", aliases: ["ephesians", "eph", "ep"] },
  { slug: "phil", aliases: ["philippians", "phil", "php"] },
  { slug: "col", aliases: ["colossians", "col"] },
  { slug: "1thes", aliases: ["1thessalonians", "1thess", "1thes", "1th"] },
  { slug: "2thes", aliases: ["2thessalonians", "2thess", "2thes", "2th"] },
  { slug: "1tim", aliases: ["1timothy", "1tim", "1ti"] },
  { slug: "2tim", aliases: ["2timothy", "2tim", "2ti"] },
  { slug: "titus", aliases: ["titus", "tit", "ti"] },
  { slug: "phlm", aliases: ["philemon", "phlm", "phm", "phile"] },
  // Catholic
  { slug: "heb", aliases: ["hebrews", "heb"] },
  { slug: "jas", aliases: ["james", "jas", "jm"] },
  { slug: "1pet", aliases: ["1peter", "1pet", "1pe", "1p"] },
  { slug: "2pet", aliases: ["2peter", "2pet", "2pe", "2p"] },
  { slug: "1john", aliases: ["1john", "1jn", "1jhn", "1j"] },
  { slug: "2john", aliases: ["2john", "2jn", "2jhn", "2j"] },
  { slug: "3john", aliases: ["3john", "3jn", "3jhn", "3j"] },
  { slug: "jude", aliases: ["jude", "jud", "jd"] },
  { slug: "rev", aliases: ["revelation", "apocalypse", "rev", "re", "rv"] },
  // Deuterocanon — placed after Revelation in the reader (BookCatalog.swift order_index 300+).
  { slug: "1es", aliases: ["1esdras", "1esd", "1es"] },
  { slug: "2es", aliases: ["2esdras", "2esd", "2es"] },
  { slug: "tob", aliases: ["tobit", "tob", "tb"] },
  { slug: "jdt", aliases: ["judith", "jdt", "jdth", "jth"] },
  { slug: "wis", aliases: ["wisdomofsolomon", "wisdom", "wis", "ws"] },
  { slug: "sir", aliases: ["ecclesiasticus", "sirach", "ecclus", "sir"] },
  { slug: "bar", aliases: ["baruch", "bar"] },
  { slug: "lje", aliases: ["letterofjeremiah", "epistleofjeremiah", "epjer", "letjer", "lje"] },
  { slug: "s3y", aliases: ["prayerofazariah", "songofthethreeyoungmen", "songofthethree", "songofthree", "prazar", "s3y"] },
  { slug: "sus", aliases: ["susanna", "sus"] },
  { slug: "bel", aliases: ["belandthedragon", "bel"] },
  { slug: "man", aliases: ["prayerofmanasseh", "prman", "man"] },
  { slug: "1mac", aliases: ["1maccabees", "1macc", "1mac", "1ma", "1m"] },
  { slug: "2mac", aliases: ["2maccabees", "2macc", "2mac", "2ma", "2m"] },
  { slug: "3mac", aliases: ["3maccabees", "3macc", "3mac", "3ma", "3m"] },
  { slug: "4mac", aliases: ["4maccabees", "4macc", "4mac", "4ma", "4m"] },
  { slug: "ps151", aliases: ["psalm151", "ps151"] },
];

// Build a flat alias index sorted by length desc so the longest match wins.
// Exported so the inline-prose detector ([[scripture-refs]]) can build its
// regex from the same source — keeping book coverage in one place.
export const ALIAS_INDEX: Array<{ alias: string; slug: string }> = (() => {
  const out: Array<{ alias: string; slug: string }> = [];
  for (const b of BOOKS) for (const a of b.aliases) out.push({ alias: a, slug: b.slug });
  return out.sort((x, y) => y.alias.length - x.alias.length);
})();

export interface ParsedReference {
  bookSlug: string;
  chapter: number;
  verse: number | null;
  /** Where to navigate. */
  href: string;
}

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[,;]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse "John 3:16", "Ps 23", "1 Cor 13:4", "matt 5.7" etc.
 * Returns null if the input doesn't begin with a recognized book.
 */
export function parseReference(input: string): ParsedReference | null {
  const norm = normalize(input);
  if (!norm) return null;

  // Try to match book first by removing spaces between alias chars (so "1 cor"
  // and "1cor" both match "1cor").
  const compact = norm.replace(/\s+/g, "");

  let bookSlug: string | null = null;
  let restNorm = "";
  for (const { alias, slug } of ALIAS_INDEX) {
    if (compact.startsWith(alias)) {
      bookSlug = slug;
      // Advance past alias.length non-space chars in norm so the remainder
      // keeps its spaces — "3 16" can then be read as chapter 3 verse 16.
      let consumed = 0;
      let i = 0;
      while (i < norm.length && consumed < alias.length) {
        if (norm[i] !== " ") consumed++;
        i++;
      }
      restNorm = norm.slice(i);
      break;
    }
  }
  if (!bookSlug) return null;

  // Strip any leading non-digit separator (e.g. ".", ":", "-", " ") left over
  // after the alias match, then read chapter and optional verse.
  // The separator between chapter and verse may be ":", ".", or " ".
  const restClean = restNorm.replace(/^[^\d]+/, "");
  const m = restClean.match(/^(\d+)(?:[:.  ](\d+))?/);
  const chapter = m ? Number(m[1]) : 1;
  const verse = m && m[2] ? Number(m[2]) : null;

  // If rest is empty (e.g., "John"), default to chapter 1.
  const ch = Number.isFinite(chapter) && chapter > 0 ? chapter : 1;
  const v = verse !== null && Number.isFinite(verse) && verse > 0 ? verse : null;

  return {
    bookSlug,
    chapter: ch,
    verse: v,
    href: v !== null
      ? `/reader/bible/${bookSlug}/${ch}#v${v}`
      : `/reader/bible/${bookSlug}/${ch}`,
  };
}

export function bookSlugs(): string[] {
  return BOOKS.map((b) => b.slug);
}
