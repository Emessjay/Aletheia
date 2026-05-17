# Bible commentary sources

Vetted PD-redistributable digital editions for the Aletheia "Commentaries" tab.
All five sources below meet the CLAUDE.md "no strings" goal — the digital
edition itself is in the public domain, not merely the underlying author.
CCEL is explicitly **avoided** despite hosting most of these works: CCEL's
terms restrict use to "personal, educational, or non-profit" and require
contacting them to republish, which puts their XML files in CLAUDE.md rank 5
(never bundle). SWORD/CrossWire modules are downstream of the same source
texts but are tagged `License=Public Domain` and distributed under explicit
"Copy Freely" terms; legally this is the cleanest form of the same text.

## Selected sources

| Commentary       | Source                                | Format             | License            |
| ---------------- | ------------------------------------- | ------------------ | ------------------ |
| Matthew Henry    | `lyteword/mhenry-complete` (GitHub)   | Markdown (6 vols)  | CC0-1.0            |
| Calvin           | CrossWire SWORD `CalvinCommentaries`  | SWORD rawcom/zcom  | Public Domain      |
| JFB              | CrossWire SWORD `JFB`                 | SWORD rawcom/zcom  | Public Domain      |
| Wesley's Notes   | CrossWire SWORD `Wesley`              | SWORD rawcom/zcom  | Public Domain      |
| Adam Clarke      | CrossWire SWORD `Clarke`              | SWORD rawcom/zcom  | Public Domain      |

## Status

| Commentary       | Ingest | UI visible | Notes                                       |
| ---------------- | :----: | :--------: | ------------------------------------------- |
| Matthew Henry    | ✓      | ✓          | 66 books, 1189 chapters, 3366 comment blocks |
| Calvin           | ✗      | ✗          | SWORD module pending mod2imp wiring         |
| JFB              | ✗      | ✗          | SWORD module pending mod2imp wiring         |
| Wesley's Notes   | ✗      | ✗          | SWORD module pending mod2imp wiring         |
| Adam Clarke      | ✗      | ✗          | SWORD module pending mod2imp wiring         |

After Matthew Henry, the bundled corpus grew from 203 MB to 265 MB. The four
SWORD modules together will likely add another ~150 MB.

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
