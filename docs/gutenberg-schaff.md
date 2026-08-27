# Project Gutenberg as Schaff / reformers fallback (research memo)

**Not legal advice.** Companion to
[`docs/ccel-thml-licensing.md`](ccel-thml-licensing.md). Question: can
Aletheia re-source ANF / NPNF / Creeds / reformers from Project Gutenberg
instead of (or as fallback to) CCEL ThML?

**Verdict: not viable as a ThML replacement for ANF / NPNF / Creeds.
Partial / opportunistic for some reformers only. Still email CCEL.**

---

## 1. Bottom line

| Corpus | PG as drop-in for CCEL volumes? | Notes |
| ------ | ------------------------------- | ----- |
| **ANF** (Schaff vols 1–9) | **No** | No Schaff ANF set on PG. Only a few **Ante-Nicene Christian Library (ANCL)** Edinburgh volumes (~3–5 ebooks), different volume plan than Schaff’s American reprint. |
| **NPNF** Series I + II (28 vols) | **No** | Catalog search for “Nicene and Post-Nicene” / Schaff NPNF → **zero** hits. Standalone Augustine/etc. are different editions or incomplete. |
| **Creeds of Christendom** (Schaff 1–3) | **No** | No PG ebook of Schaff’s three-volume *Creeds*. |
| **Reformers** (Luther / Calvin / Knox / Latimer as currently fetched) | **Partial** | Several useful PG texts exist, but often **selections**, **different translations**, or **incomplete** vs CCEL ThML files. |

PG is excellent for what it already feeds (Luther **commentaries** via
`tools/luther-pg-extract/`). It is **not** a turnkey corpus for the
Resources tab’s ANF / NPNF / Creeds packs. For a PD re-source of the
fathers, **Wikisource** (full ANF + NPNF portals) or IA OCR is a better
primary candidate than Gutenberg — still months of parser work.

**Recommended path:** keep contacting CCEL for derived-SQLite permission
(primary). Do **not** invest in a Gutenberg ANF/NPNF ingest. Optionally
pilot **PG-only for a few reformers** where coverage is real (e.g. Calvin
*Institutes* Allen, Knox *First Blast*, Luther Small Catechism /
Smalcald) if CCEL refuses — accepting edition drift and loss of `{ref}`.

---

## 2. What Aletheia needs today

From `scripts/fetch_sources.sh` + `Pipeline.swift`:

| Group | CCEL inputs | App surface |
| ----- | ----------- | ----------- |
| ANF | `anf01`…`anf09` ThML | Resources pack `anf` |
| NPNF | `npnf101`…`114`, `npnf201`…`214` | Resources pack `npnf` |
| Creeds | `creeds1`…`creeds3` (+ `schaff-creeds-fixup` on vol 3) | Base pack |
| Reformers | Luther / Calvin / Knox / Latimer ThML files listed in fetch script | Resources pack `reformers` |

`ThMLParser` expects volume XML with:

- `discoverWorks` over `<div1>` (works), then chapter/section
  `<div2>` / `<div3>`…
- `<scripRef passage="…">` → `{ref:…}…{/ref}`
- `<i>` / `<em>` → `{em}`; endnotes → `{fn:N}`; headings → `{h2}`…

Resources UI (`resourcesCorpora.ts`) is slug-prefix based (`anf*`,
`npnf*`, `creeds*`, `luther_` / `calvin_` / …). Any new source must still
produce that `section` tree or the sidebar hierarchy collapses.

---

## 3. Coverage table — fathers & creeds

### 3.1 Schaff ANF (American reprint) — **not on PG**

| Aletheia / CCEL | Gutenberg? | ID(s) | Gap |
| --------------- | ---------- | ----- | --- |
| ANF 1–9 full set | **Missing** | — | No Schaff-titled ANF volumes in PG catalog (search “Ante-Nicene Fathers” → only ANCL Apostolic Fathers). |
| ANF 10 bibliographic stub | Skipped already | — | N/A |

### 3.2 Related ANCL (Edinburgh Roberts & Donaldson) — **sparse PG**

ANCL is the **Edinburgh** series that Schaff’s American ANF largely
rearranged. Volume numbers **do not match** Schaff `anf0N`. Useful as
independent PD text, not as a 1:1 swap for `anf01.xml`…`anf09.xml`.

| PG title | ID | Year / series | Formats | Maps roughly to | Completeness notes |
| -------- | -- | ------------- | ------- | --------------- | ------------------ |
| *The writings of the Apostolic Fathers* | [77576](https://www.gutenberg.org/ebooks/77576) | 1870; **ANCL vol. 1** | HTML, EPUB, plain UTF-8 | Part of Schaff **ANF1** (Clement, Ignatius, Polycarp, Barnabas, Hermas, …) | **Missing** Justin Martyr + Irenaeus that Schaff put in ANF1. PGDP proofread from IA. |
| *Writings of Clement of Alexandria*, Vol. 1 | [71937](https://www.gutenberg.org/ebooks/71937) | 1867; ANCL | HTML, EPUB, plain | Part of Schaff **ANF2** | Exhortation, Instructor, early Stromata; footnotes as `[N]` anchors. |
| *Writings of Clement of Alexandria*, Vol. 2 | [73020](https://www.gutenberg.org/ebooks/73020) | 1869; ANCL | HTML, EPUB, plain | Rest of Clement in ANF2 | Same. |
| *Writings of Origen*, Vol. 1 | [70561](https://www.gutenberg.org/ebooks/70561) | 1869; ANCL | HTML, EPUB, plain | Parts of Schaff **ANF4** / Origen material | *De Principiis*, Africanus letters, *Contra Celsum* book 1. |
| *Writings of Origen*, Vol. 2 | [70693](https://www.gutenberg.org/ebooks/70693) | ANCL | HTML, EPUB, plain | Further Origen | Not a full Schaff Origen/ANF9 supplement. |

**Not found on PG (spot-checked):** Tertullian ANCL volumes, Lactantius,
full Hippolytus/Cyprian as Schaff ANF5, ANF 3/5/6/7/8 as sets, Schaff
indexes.

Nearby but **wrong edition** for a Schaff swap: Hippolytus
*Philosophumena* ([65478](https://www.gutenberg.org/ebooks/65478) /
[67116](https://www.gutenberg.org/ebooks/67116)) — not the ANF apparatus.

**License on ebook pages:** “Public domain in the USA” + standard
Project Gutenberg License (trademark terms if you keep the PG name;
strip PG header/license and redistribute the PD text without the mark —
see §5).

### 3.3 NPNF Series I + II — **not on PG**

| Need | Gutenberg? |
| ---- | ---------- |
| NPNF1 vols 1–14 (Augustine + Chrysostom) | **No set** |
| NPNF2 vols 1–14 | **No set** |

Standalone texts that **look** related but are not volume replacements:

| Title | ID | Why not enough |
| ----- | -- | -------------- |
| *City of God* Vols I–II (ed. Marcus Dods) | [45304](https://www.gutenberg.org/ebooks/45304), [45305](https://www.gutenberg.org/ebooks/45305) | Dods translation overlaps NPNF1-02’s *City of God* lineage, but **omits** the rest of that NPNF volume (*Christian Doctrine*) and all other NPNF vols. |

No PG hits for “Nicene and Post-Nicene Fathers” / “Schaff” NPNF series
titles.

### 3.4 Creeds of Christendom — **not on PG**

Search “Creeds of Christendom” does not return Schaff’s 3-volume work.
(Individual confessions exist elsewhere on PG — e.g. Augsburg — but that
is not Schaff’s symbolical library / bilingual apparatus in `creeds2` /
`creeds3`.)

### 3.5 Wikisource (secondary)

| Collection | URL | vs PG |
| ---------- | --- | ----- |
| ANF | https://en.wikisource.org/wiki/Ante-Nicene_Fathers | **Full** vol I–IX structure; PD dedication on portal |
| NPNF I | https://en.wikisource.org/wiki/Nicene_and_Post-Nicene_Fathers:_Series_I | Full volume TOC; transcription quality varies by page |
| NPNF II / Early Fathers portal | https://en.wikisource.org/wiki/Portal:Early_Church_Fathers_series | Indexed |

If CCEL fails and we re-source fathers, **Wikisource ≫ Gutenberg** for
coverage. Still no ThML `scripRef`; MediaWiki HTML → new parser; effort
measured in **months**, not days.

---

## 4. Coverage table — reformers (vs current CCEL fetch list)

| Current CCEL file | Gutenberg candidate | ID | Match quality |
| ----------------- | ------------------- | -- | ------------- |
| `luther_bondage` | — | — | **Missing** (use CCEL / Project Wittenberg / other PD). |
| `luther_tabletalk` | *Selections from the Table Talk* | [9841](https://www.gutenberg.org/ebooks/9841) | **Selections only**, not full Aurifaber/CCEL tabletalk. |
| `luther_first_prin` | *Works of Martin Luther…* Vols I–II (Philadelphia) | [31604](https://www.gutenberg.org/ebooks/31604), [34904](https://www.gutenberg.org/ebooks/34904) | Overlaps 95 Theses + primary treatises; **different edition** than Wace/CCEL `first_prin`. |
| `luther_smalcald` | *The Smalcald Articles* | [273](https://www.gutenberg.org/ebooks/273) | Likely usable (verify text vs CCEL). |
| `luther_smallcat` | *Luther's Little Instruction Book* (Small Catechism) | [1670](https://www.gutenberg.org/ebooks/1670) | Usable; confirm translator. |
| `luther_largecatechism` | *Martin Luther's Large Catechism* (Bente/Dau) | [1722](https://www.gutenberg.org/ebooks/1722) | Usable; edition ≠ CCEL largecatechism markup. |
| `luther_good_works` | Possibly inside Works vols | 31604 / 34904 | Needs chapter mapping; not a dedicated ebook. |
| `luther_sermons` | Lenker *Epistle Sermons* etc. | e.g. 28464, 30619 | **Different** corpus than CCEL “Assorted Sermons”; already have commentary-side Luther from PG. |
| `luther_translating` | — | — | Not verified as standalone PG. |
| `calvin_institutes` | *Institutes* Vols 1–2 | [45001](https://www.gutenberg.org/ebooks/45001), [64392](https://www.gutenberg.org/ebooks/64392) | **Full** final Institutes, but **John Allen** translation. CCEL ThML is typically **Beveridge**. Same work family; not byte-identical; acceptable if we document the edition. |
| `calvin_sermons` | — | — | No clear PG match for CCEL three-volume sermons pack. |
| `calvin_treatise_relics` | — | — | Not found in catalog spot-check. |
| `knox_blast` | *First Blast of the Trumpet…* | [9660](https://www.gutenberg.org/ebooks/9660) | **Good** match (Arber). |
| `knox_history_reformation` | Inside *Works of John Knox* | [21938](https://www.gutenberg.org/ebooks/21938) (vol 1 of 6) | Partial; History lives across Works. |
| `knox_prayer` | — | — | Not verified standalone. |
| `knox_works1` | *Works* Vol 1 | [21938](https://www.gutenberg.org/ebooks/21938) | Good for vol 1; **vol 2** also [40886](https://www.gutenberg.org/ebooks/40886); **vols 3–6 not on PG** (same gap fetch_sources already notes for CCEL). |
| `latimer_sermons` | *Sermons on the Card, and Other Discourses* | [2458](https://www.gutenberg.org/ebooks/2458) | **Subset** (Morley/Cassell), **not** full Parker Society volume CCEL ships. |

**Already trusted PG path:** Luther biblical commentaries
`#1549`, `#27978`, `#29678`, `#48193` → `tools/luther-pg-extract/`
(commentaries tab — out of scope for Resources reformers, but proves
PG plain-text ingest is workable when structure is regular).

---

## 5. Markup quality vs ThML (sample comparison)

Fetched samples (2026-08):

- PG HTML: [77576](https://www.gutenberg.org/files/77576/77576-h/77576-h.htm),
  [71937](https://www.gutenberg.org/files/71937/71937-h/71937-h.htm)
- CCEL ThML head of `anf01.xml` from `https://ccel.org/ccel/schaff/anf01.xml`

| Feature | CCEL ThML (`anf01`) | PG HTML (ANCL samples) |
| ------- | ------------------- | ---------------------- |
| Work / chapter hierarchy | Explicit `div1` / `div2` / `div3` + titles | Headings + `div.chapter` / id anchors; **CSS class soup** (`c009`, `pageno`, …) varies by ebook |
| Scripture refs | `<scripRef passage="…" osisRef="…">` (~132 in first 80 KB of anf01) | **None structured** — prose / italics only |
| Footnotes | `<note place="end" n="N">` | `[1]` / `fnanchor` / `<sup>` links — recoverable with effort, per-ebook dialect |
| Emphasis | `<i>` / `<em>` | Present (`<i>`) |
| Indexes / Greek apparatus | Present in Schaff volumes | Partial; page images / page-no spans common |
| Source character | Structured theological markup | Proofread print (IA → PGDP); **not** OCR dump, but also **not** ThML |

**Could we parse PG into `section`?** Yes for coarse work → chapter →
paragraph trees on a **per-ebook** basis (similar spirit to
`luther-pg-extract`). No for preserving Aletheia’s `{ref}` density or
ThML’s `discoverWorks` over a whole Schaff volume without hand rules.

**Hybrid (PG body + CCEL TOC):** usually a **bad idea** — verse/section
boundaries won’t align across editions (ANCL vs Schaff pagination;
Allen vs Beveridge Institutes), and blending sources muddies the
licensing story the re-source was meant to clean up.

**Effort estimate**

| Scope | Effort |
| ----- | ------ |
| One reformer treatise (plain PG → sections, no `{ref}`) | **Days** (reuse luther-pg patterns) |
| All reformers currently on CCEL, best-effort PG | **1–3 weeks** + edition QA; several titles still missing |
| Full ANF via sparse ANCL PG only | **Not viable** for sidebar parity (~⅓ of fathers missing) |
| Full ANF+NPNF via Wikisource / IA | **Months** (parser + TOC QA + footnote pass); still no cheap `{ref}` |
| ThML-equivalent `{ref}` retag | **Not practical** without NLP / volunteer markup |

---

## 6. License: Gutenberg digital edition vs CCEL

| | **CCEL ThML** | **Project Gutenberg (US-PD titles)** |
| - | ------------- | ------------------------------------ |
| Underlying Schaff / ANCL English | PD by age | PD by age |
| Digital edition claim | Contact for republish / commercial; Vision asserts copyright on **XML** | Catalog: “Public domain in the USA”; PG License adds **trademark** rules if you keep the name |
| Redistributing derived SQLite | Unclear / ask | After stripping PG header & trademark, US redistribution of the PD text is what PG documents as unrestricted ([license](https://www.gutenberg.org/policy/license.html)) |
| Fits `CLAUDE.md` “no strings extract” | Awkward (yellow) | Better **if** we strip PG trademark and attribute honestly; still check **non-US** for any title |

PG is **cleaner for distribution** than CCEL for the titles it actually
has. It does **not** invent missing volumes. Non-US users must still
check local law (PG’s own header warning).

---

## 7. Recommended path

1. **Still email CCEL** for written permission to ship derived SQLite
   packs (ANF / NPNF / Creeds / reformers) — cheapest way to keep ThML
   quality (`{ref}`, work discovery). See
   `docs/ccel-thml-licensing.md` §6.
2. **Do not** plan a Gutenberg-based ANF/NPNF/Creeds replacement —
   coverage gap is decisive.
3. **If CCEL refuses / NC-only:** prefer **Wikisource (fathers) +
   selective PG (reformers)** over “PG for everything.”
4. **Optional small win without waiting on CCEL:** document PG as an
   *additional* clean source for Institutes (Allen), Knox Blast, Luther
   catechisms / Smalcald — only if product owners accept edition drift
   vs current CCEL text. Not required for licensing if CCEL permits
   current packs.
5. **Honesty:** attributions should not say “Public Domain / extract
   freely” for CCEL-derived packs until permitted or re-sourced
   (already flagged in the CCEL memo).

---

## 8. Sketch if we ever ingest PG fathers/reformers

No implementation in this branch — sketch only:

```
data/sources/pg/
  anf-ancl/77576.txt | .html
  reformers/45001.txt …
scripts/fetch_sources.sh   # curl https://www.gutenberg.org/cache/epub/{id}/pg{id}.txt
tools/pg-patristics-extract/   # per-ebook chapter splitters → section JSON
Pipeline.swift                 # new stage OR temporary dual-path behind a flag
```

Parser rules of thumb (from samples):

- Prefer **plain text** for regularity (luther-pg pattern); fall back to
  HTML when TOC anchors are clearer (`div.chapter`, `id=` work titles).
- Strip PG boilerplate between `*** START OF … ***` / `*** END … ***`.
- Map footnotes `[N]` / `fnanchor` → `{fn:N}` where defs are findable;
  skip `{ref}` unless a later heuristic pass is funded.
- **Do not** invent Schaff volume slugs from ANCL ebooks — use
  `ancl77576.*` / work-centric slugs so we never pretend full ANF
  coverage.

---

## 9. Key URLs

| Resource | URL |
| -------- | --- |
| PG Apostolic Fathers (ANCL 1) | https://www.gutenberg.org/ebooks/77576 |
| PG Clement ANCL | https://www.gutenberg.org/ebooks/71937 , https://www.gutenberg.org/ebooks/73020 |
| PG Origen ANCL | https://www.gutenberg.org/ebooks/70561 , https://www.gutenberg.org/ebooks/70693 |
| PG Calvin Institutes (Allen) | https://www.gutenberg.org/ebooks/45001 , https://www.gutenberg.org/ebooks/64392 |
| PG Knox Blast | https://www.gutenberg.org/ebooks/9660 |
| PG license | https://www.gutenberg.org/policy/license.html |
| Wikisource ANF | https://en.wikisource.org/wiki/Ante-Nicene_Fathers |
| Wikisource Early Fathers portal | https://en.wikisource.org/wiki/Portal:Early_Church_Fathers_series |
| CCEL licensing memo | `docs/ccel-thml-licensing.md` |
