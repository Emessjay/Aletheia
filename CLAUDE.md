# Aletheia — Claude project notes

## Corpus licensing policy

When sourcing new content for the bundled corpus (`data/Aletheia.sqlite`), prefer
**CC0 / public domain / Unlicense** sources. The goal is for anyone to be able to
extract and reuse the corpus with zero attribution or licensing strings.

Ranked preference:

1. **Public domain by age** (pre-1929 works, ancient texts) — ideal.
2. **CC0 / Unlicense / explicit PD dedication** — ideal.
3. **CC BY** — acceptable only when no PD equivalent exists; requires a credit-screen
   entry and a note in [README.md](README.md).
4. **CC BY-SA, CC BY-NC, GPL** — avoid. ShareAlike is viral and NC blocks reuse;
   either disqualifies the corpus from the "no strings" goal.
5. **"All rights reserved" / unlicensed digital editions** — never bundle. Re-source
   from a scan, a PD transcription, or drop the content.

When evaluating a candidate, verify the *digital edition's* license, not just the
underlying work — a PD-by-age text can still ship under CC BY if the transcriber
asserts rights over the markup.

### Strong's coverage is optional on non-English sides

A tagged Hebrew OT (Strong's + morphology) with a true PD license does not appear
to exist — every option (OSHB/morphhb, Westminster Hebrew Morphology, etc.) is at
least CC BY. If forced to choose, **ship Strong's lookups only on the English
side** rather than pulling in a CC BY tagged Hebrew or Greek text. Untagged PD
Hebrew (e.g. tanach.us WLC) and untagged PD Greek (e.g. eBible.org `grcbrent` for
LXX, byztxt for the Byzantine NT — which *is* PD-tagged) are preferable to a
tagged-but-encumbered alternative.

### Sources already vetted PD

- BSB (post-2023 PD dedication), Brenton English LXX, KJV + Apocrypha
- eBible.org `grcbrent` (Brenton Greek LXX)
- byztxt/byzantine-majority-text (Robinson-Pierpont, PD with Strong's + morphology)
- Jacob-Gray/summa.json (Unlicense)
- Treasury of Scripture Knowledge (1880s, PD)
- eliranwong/unabridged-BDB-Hebrew-lexicon (underlying BDB PD)

### Sources to avoid or replace

- **First1KGreek** — CC BY-SA 4.0. Viral. Currently used for Greek patristics;
  do not extend to biblical content.
- **Corpus Thomisticum** — "iura omnia asservantur." Not redistributable. The
  README's "non-commercial w/ attribution" line understates the restriction.
- **CCAT / CATSS LXX** — user-declaration requirement; treat as non-PD.
- **SBLGNT, Tyndale House GNT, BHS, Rahlfs-Hanhart, Göttingen LXX** — copyrighted.
