/**
 * Normalization for Greek surface-form matching.
 *
 * Mirrors `GreekNormalize.key` in `tools/ingest/Sources/Ingest/LXXTagger.swift`:
 * NFC + lowercase + final-sigma fold + strip leading/trailing non-letters.
 * Used when looking up English undertext (or Strong's) by Greek surface so
 * all-caps LXX / Brenton tokens (ΕΝ, ΘΕΟΣ) hit the same keys as lowercase NT
 * forms (ἐν, θεός → θεοσ after sigma fold).
 *
 * Display must keep the original surface; only pass the key into Map lookups.
 */

/** True when the token has at least one letter and no lowercase letters. */
export function isAllCapsGreek(raw: string): boolean {
  let sawLetter = false;
  for (const ch of raw) {
    if (!/\p{L}/u.test(ch)) continue;
    sawLetter = true;
    // Polytonic capitals like Ἐ are Lu but toLocaleUpperCase("el") may strip
    // diacritics (Ἐ → Ε), so use the Unicode general category instead.
    if (/\p{Ll}/u.test(ch)) return false;
  }
  return sawLetter;
}

/**
 * Comparison key for a Greek surface. Returns null for punctuation/digits-only.
 * Always lowercases (all-caps LXX and mixed-case NT share one key space).
 */
export function greekNormalizeKey(raw: string): string | null {
  const nfc = raw.normalize("NFC");
  const lower = nfc.toLocaleLowerCase("el");
  // Fold final sigma onto medial so ΛΟΓΟΣ → λογοσ matches λόγος → λογοσ.
  const folded = lower.replace(/ς/g, "σ");
  let start = 0;
  let end = folded.length;
  while (start < end && !/\p{L}/u.test(folded[start]!)) start += 1;
  while (end > start && !/\p{L}/u.test(folded[end - 1]!)) end -= 1;
  if (start >= end) return null;
  return folded.slice(start, end);
}

/**
 * Look up a value keyed by normalized Greek surface. All-caps LXX tokens
 * casefold via {@link greekNormalizeKey} before the Map get — the raw surface
 * is never used as the map key.
 */
export function lookupByGreekSurface<T>(
  map: ReadonlyMap<string, T>,
  surface: string,
): T | undefined {
  const key = greekNormalizeKey(surface);
  if (key == null) return undefined;
  return map.get(key);
}
