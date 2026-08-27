/**
 * Resolve a word row's Strong's fields to a lexicon table id.
 *
 * STEPBible's dStrongs column stores prefixed forms like `H9003/{H7225G}`
 * (preposition + root). The ingest stores the prefix code in `word.strongs`
 * and the root in `word.lemma`. Prefix codes (H9001–H9009) are STEPBible
 * grammar markers — they are not rows in the BDB/Thayer lexicon table.
 */
export function lexiconStrongsId(
  strongs: string | null | undefined,
  lemma: string | null | undefined,
): string | null {
  const fromStrongs = normalizeStrongsId(strongs);
  if (fromStrongs && !isStepPrefixCode(fromStrongs)) return fromStrongs;
  const fromLemma = normalizeStrongsId(lemma);
  if (fromLemma) return fromLemma;
  return fromStrongs;
}

/** STEPBible particle/prefix dStrong codes — not in the Strong's lexicon. */
function isStepPrefixCode(id: string): boolean {
  return /^H900[0-9]$/.test(id);
}

/** Canonical id: `H`/`G` + digits, no leading zeros or instance suffixes. */
export function normalizeStrongsId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[{}]/g, "");
  // dStrongs often encodes prefix/root as `H9003/{H7225G}` — take the root.
  if (s.includes("/")) s = s.split("/").pop()!.trim();
  const m = s.match(/^([GH])(\d+)/i);
  if (!m) return null;
  const num = m[2].replace(/^0+/, "") || "0";
  return m[1].toUpperCase() + num;
}
