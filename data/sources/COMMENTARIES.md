# Bible commentary sources

Vetted PD-redistributable digital editions for the Aletheia "Commentaries" tab.
All sources below meet the CLAUDE.md "no strings" goal — the digital edition
itself is in the public domain, not merely the underlying author. CCEL is
explicitly **avoided** despite hosting most of these works: CCEL's terms
restrict use to "personal, educational, or non-profit" and require contacting
them to republish, which puts their XML files in CLAUDE.md rank 5 (never
bundle). SWORD/CrossWire modules are downstream of the same source texts but
are tagged `License=Public Domain` and distributed under explicit "Copy
Freely" terms; legally this is the cleanest form of the same text. Project
Gutenberg's plain-text editions are an equivalent fallback when no SWORD
module exists.

## Selected sources

| Commentary       | Source                                | Format             | License            |
| ---------------- | ------------------------------------- | ------------------ | ------------------ |
| Matthew Henry    | `lyteword/mhenry-complete` (GitHub)   | Markdown (6 vols)  | CC0-1.0            |
| Calvin           | CrossWire SWORD `CalvinCommentaries`  | SWORD rawcom/zcom  | Public Domain      |
| JFB              | CrossWire SWORD `JFB`                 | SWORD rawcom/zcom  | Public Domain      |
| Wesley's Notes   | CrossWire SWORD `Wesley`              | SWORD rawcom/zcom  | Public Domain      |
| Adam Clarke      | CrossWire SWORD `Clarke`              | SWORD rawcom/zcom  | Public Domain      |
| Luther           | Project Gutenberg #1549/29678/48193/27978 | Plain text     | Public Domain (US) |

## Status

| Commentary       | Ingest | UI visible | Verse comments | Books |
| ---------------- | :----: | :--------: | :------------: | :---: |
| Matthew Henry    | ✓      | ✓          | 3366 pericopes | 66    |
| Calvin           | ✓      | ✓          | 13,823          | 48    |
| JFB              | ✓      | ✓          | 24,813          | 66    |
| Wesley's Notes   | ✓      | ✓          | 18,124          | 64    |
| Adam Clarke      | ✓      | ✓          | 21,052          | 66    |
| Luther           | ✓      | ✓          | 511             |  5    |

### Luther coverage

Luther's biblical commentary is partial by design — his Pelikan-era *Lectures
on Genesis* (later chapters), *Lectures on Romans*, *Sermons on John*, and
most of his post-1525 OT exposition (Psalms, Isaiah, Minor Prophets, Hebrews)
survive only in copyrighted 20th-century English translations. The five-book
coverage here is everything reliably available as PD plain text:

| Book        | PG #          | Translator                         | License basis                  |
| ----------- | ------------- | ---------------------------------- | ------------------------------ |
| Galatians   | 1549          | Theodore Graebner (1937)           | US-PD by copyright non-renewal |
| 1 Peter     | 29678         | E. H. Gillett, ed. Lenker (1904)   | PD by age                      |
| 2 Peter     | 29678         | "                                  | "                              |
| Jude        | 29678         | "                                  | "                              |
| Genesis 1–9 | 48193 + 27978 | John Nicholas Lenker (1904, 1910)  | PD by age                      |

The Graebner Galatians is the only entry not PD-by-age — Project Gutenberg
distributes it under non-renewal status (verified against the Stanford
Copyright Renewal Database). It is unambiguously PD inside the US; non-US
distribution may still be restricted, which matches the standard PG applies
to its entire catalog and so falls within Aletheia's licensing policy. If a
stricter PD-by-age requirement ever becomes binding, swap in Erasmus
Middleton's 1850 translation (also PD, but archaic English).

The PG plain text is parsed by [`tools/luther-pg-extract/extract.py`](../../tools/luther-pg-extract/extract.py),
which detects three different verse-marker dialects (`  VERSE N.` in
Galatians, `V. N.` in Peter/Jude/Genesis, with sub-verse `Na`/`Nb` letters
in Genesis) and emits a single `luther.json` in the same shape the SWORD
extractor produces. The pipeline's existing `SwordCommentaryParser` ingests
it without modification.

Bundled corpus grew from 203 MB → 447 MB after adding the first five
commentaries (244 MB net); Luther adds ~2.5 MB on top.

## Tooling

SWORD modules ship as binary index/data pairs. The build pipeline shells out
to `tools/sword-extract/extract.py` (pysword in a project-local venv) to
convert each module to a verse-keyed JSON file the Swift ingester reads.
pysword refuses commentary modules by ModDrv, so the script spoofs the
driver name (`zcom4` → `ztext4`, etc.) before handing off — the on-disk
formats are byte-identical between Bible and Commentary modules.

The intermediate JSON files live under `data/sources/commentaries/` and are
gitignored. The SWORD .zip downloads under `.sword-staging/` are also
gitignored. Only the source vetting note (this file) is checked in.

## Dropped from MVP

- **John Gill's Exposition** — no PD-redistributable digital edition located.
  CCEL has it but their terms disqualify; no SWORD module under "Gill"; no
  CC0/Unlicense GitHub repo found. Re-evaluate when a clean source surfaces.

## Known follow-ups

- The Matthew Henry parser extracts a `(verseStart, verseEnd)` range for each
  comment block but does NOT populate the `citation` table yet. The label on
  each comment row IS the verse-range string ("Verses 1–5"), so the UI is
  fine; the citation join becomes load-bearing only when a future verse-panel
  in the Reader needs to look up commentary by verse.
- Header text drift: every H2 in a chapter file shares the same pericope
  heading (e.g., "The Creation (4004 BC)" repeats 10× in Genesis 1). The
  parser ignores those repeats in favor of the parsed verse range. If a
  future feature wants the pericope title, it'll need to be added back —
  probably by introducing a `pericope` section kind above the comment rows.
- Luther's verse-range markers (`V. 1, 2.`, `V. 1-6.`) are flattened onto
  their *first* verse, with the range header preserved verbatim inside the
  body so the user still sees "V. 1-6." as the opening line. A future
  improvement would teach the verse-panel lookup to match each verse in a
  range — but for the current chapter-grid display the flattening is fine.
- Luther sometimes covers the same verse in two passes (a summary pass and
  a detailed pass). Both land as separate "Verse N" comment rows under the
  chapter view, in the order Luther wrote them. This mirrors how Calvin's
  multi-pass entries already appear and needs no special handling.

## Tooling

SWORD modules ship as binary index/data pairs. To convert to a flat
verse-keyed text format the Swift ingester can read, the fetch step shells
out to either:

- `mod2imp` from the Homebrew `sword` package (CLI tool, ships with libsword), or
- `pysword` (pip-installable Python lib).

Whichever is available on the build host; the fetch script tries both. The
intermediate `.imp` dump format is one record per verse:

    $$$Gen 1:1
    Commentary text for Gen 1:1...
    $$$Gen 1:2
    Commentary text for Gen 1:2...

That format is the actual input the Swift ingester parses; the SWORD module
itself is a build-time intermediate, not committed to the repo.
