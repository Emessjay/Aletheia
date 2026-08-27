# CCEL ThML licensing options (decision memo)

**Not legal advice.** This memo summarizes publicly available CCEL terms,
what Aletheia actually ships, and practical options so a human (and, if
needed, counsel) can choose a path. US copyright outcomes on “markup of a
public-domain text” are fact-specific and unsettled in application here.

**Status posture (audit):** Yellow — fine for casual free OSS reading of
the app; awkward for Mac App Store / paid redistribution and for the
corpus “zero-strings extract” goal in `CLAUDE.md`.

---

## 1. Bottom line

Schaff’s 19th-century English ANF / NPNF / *Creeds* / Reformation
translations are **public domain by age**. CCEL’s **digital editions**
are not a free-for-all: the official policy allows personal, educational,
or non-profit use and tells you to **contact them** before republishing
or commercial use ([copyright policy](https://www.ccel.org/about/copyright.html)).
A Vision addendum further says copyright is **asserted on XML files**,
with permission “automatically granted for all uses other than large
scale or commercial republication”
([Vision](https://ccel.org/info/vision.html)).

Aletheia does **not** ship raw ThML in the app binary: ingest turns CCEL
XML into SQLite `section` rows with our own `{em}` / `{ref}` / `{fn}` /
`{hN}` tokens. That is better than redistributing `.xml`, but it does
**not** by itself prove the derived SQLite is outside CCEL’s claimed
rights or their “republish / commercial” ask. README / attributions
currently understate this (they treat the corpus as PD / license-clean
while naming “CCEL ThML transcription”).

**Cheapest high-clarity path:** ask CCEL in writing for permission to
redistribute derived SQLite packs (free OSS + App Store scenarios you
care about). **Fallback if they refuse or NC-only:** re-source from a
non-CCEL PD edition (Wikisource / IA OCR / independent proofread text)
and accept loss of ThML structure until re-tagged.

---

## 2. What we currently ship

| Layer | Location | In git / product? | Content |
| ----- | -------- | ----------------- | ------- |
| Raw ThML | `data/sources/patristics/*.xml` via `scripts/fetch_sources.sh` | **Gitignored** (`data/sources/*/`). Contributors who run fetch get CCEL XML locally. | Full Schaff ANF (vols 1–9), NPNF1/2, Creeds 1–3, Luther/Calvin/Knox/Latimer treatises |
| Derived corpus | `data/Aletheia.sqlite` → packs | Gitignored artifacts; **distributed** in desktop builds / packs | `section.body` plain text + Aletheia inline tokens — **not** ThML element names |
| Base pack | `base.sqlite` | Ships with lean desktop | Includes **Creeds** (CCEL-sourced) + Summa (Unlicense) + Bibles |
| Optional packs | `anf.sqlite`, `npnf.sqlite`, `reformers.sqlite` | Optional desktop shards | Full ANF / NPNF / reformers from same ThML pipeline |
| Web Postgres | `section` truncated in ingest | Patristics/commentaries tabs **hidden** on web | No ANF/NPNF body on free-tier web today |

**Parser behavior** (`tools/ingest/.../ThMLParser.swift`): discovers works
from ThML `<divN>` structure; extracts paragraph text; maps
`<scripRef passage="…">` → `{ref:…}…{/ref}`; maps italics/emphasis →
`{em}`; footnotes → `{fn:N}`; later headings → `{h2}`… . The app
renderer never opens ThML.

**Contrast — commentaries already avoid CCEL:** see
[`data/sources/COMMENTARIES.md`](../data/sources/COMMENTARIES.md)
(Matthew Henry CC0; Calvin/JFB/Wesley/Clarke CrossWire SWORD tagged PD;
Luther commentaries Project Gutenberg). Patristics/reformers still use
CCEL ThML “because that’s how the pipeline is fed.”

**Public claims to reconcile:**

- `docs/ABOUT.md` / README: corpus “public domain or no-strings.”
- `AttributionsRoute`: ANF/NPNF/Creeds/reformers listed as **Public
  Domain** with detail “CCEL ThML transcription.”
- `CLAUDE.md`: verify the *digital edition’s* license; avoid unlicensed
  / all-rights digital editions; CC BY only when no PD equivalent.

---

## 3. What CCEL claims (with URLs)

### Official copyright page

<https://www.ccel.org/about/copyright.html>

Key points (paraphrase + quote intent):

- Site / “special contents” copyright 1993–2020 Harry Plantinga.
- Most editions are based on US public-domain books; may include
  copyrighted introductions, cover art, other special contents; a few
  books are under another publisher’s copyright (noted per book).
- **“These books may be used for personal, educational, or non-profit
  purposes. Contact us for permission to republish CCEL works or to use
  them commercially.”**
- Non-US copyright may still restrict some titles that are PD in the US.

The page does **not** spell out a clean carve-out for “plain text only”
or “derived SQLite OK.” The republish/commercial ask is broad.

### Vision addendum (XML-specific)

<https://ccel.org/info/vision.html> (2006 addendum)

> “To protect the project, copyright has been asserted on XML files,
> with permission automatically granted for all uses other than large
> scale or commercial republication of books.”

That is the clearest statement that the **asserted** interest is the
**XML**, and that non–large-scale / non-commercial use is treated as
already permitted. It does not define “large scale,” “commercial,” or
whether a transformed SQLite corpus counts as republication of the XML.

### Contact / permission process

- Web form: <https://www.ccel.org/info/email>
- Address used elsewhere on the site for project mail:
  `ccel@calvin.edu` (e.g. recording pages)
- Postal (donations / vision): Christian Classics Ethereal Library,
  3201 Burton St SE, Grand Rapids, MI 49546
- Director (FAQ): Harry Plantinga, Calvin University —
  <https://www.ccel.org/info/faq>

No public “app license” template or open Schaff-fathers license beyond
the copyright / Vision language was found. Expect a custom reply.

### Do they distinguish plain text vs XML?

- **Vision:** copyright asserted on **XML files**.
- **Copyright page:** “republish CCEL works” / commercial use — format
  not limited to XML.
- CCEL also offers generated **Plain Text / Unicode** downloads beside
  ThML (e.g. volume download lists). Those are still CCEL’s digital
  edition of the same markup pipeline; treating `.txt` as magically
  license-free is **not** supported by the copyright page.
- Independent plain-text of the same Schaff English (Wikisource, IA OCR
  of 1880s print, etc.) is a different digital edition.

---

## 4. Risk matrix

| Scenario | Risk (relative) | Why |
| -------- | --------------- | --- |
| Free GitHub OSS (source + build scripts; no binary corpus) | Lower | Raw XML not in git; users who `fetch_sources` accept CCEL terms themselves. Derived DB still a community build artifact. |
| Self-hosted / Railway web (patristics currently trimmed) | Low today | `section` empty / tabs hidden — little CCEL-derived body shipped. Risk returns if packs are re-enabled on web. |
| Mac App Store **free** app bundling `anf`/`npnf`/`reformers`/`creeds` | Medium–high | Apple Guideline **5.2** expects you created the content or have a license. CCEL “contact for republish / commercial” + Vision “large scale or commercial republication” both bite distribution at App Store scale. Free ≠ automatically “non-commercial” under their wording. |
| **Paid** App Store / paid corpus | High | Explicitly outside the stated personal/educational/non-profit lane without permission. |
| Third party extracts `Aletheia.sqlite` / packs under Aletheia’s CC0 | High for *their* reuse; reputational for us | Our “corpus is PD / extract freely” claim conflicts with CCEL’s digital-edition posture. Even if PD text is free, we should not imply CCEL markup-derived structure is CC0. |

---

## 5. Options ranked (effort vs residual risk)

### A. Contact CCEL for written permission (preferred if cheap)

- **Ask for:** redistribute derived SQLite (and optional packs) of Schaff
  ANF/NPNF/Creeds + listed reformers; free OSS GitHub; free and/or paid
  desktop/App Store; credit line; no redistribution of raw ThML.
- **Effort:** Low (email + negotiation).
- **Residual risk:** Low if grant is broad and written; Medium if they
  allow only NC / attribution / no App Store / no paid.
- **Fits policy:** Best path to keep ThML quality (`{ref}` structure)
  without pretending their XML claim does not exist.

### B. Re-source from a PD plain-text edition and re-ingest

Candidates (underlying Schaff English is PD; verify each *edition*):

| Source | URL / note | Structure loss |
| ------ | ---------- | -------------- |
| Wikisource ANF | <https://en.wikisource.org/wiki/Ante-Nicene_Fathers> | Wiki HTML → need new parser; no ThML `scripRef` |
| Internet Archive / Google Books scans | e.g. IA ANF sets | OCR cleanup heavy; structure DIY |
| Project Gutenberg | Partial / uneven; not a turnkey full ANF+NPNF set | Same |
| Sacred-texts / third-party mirrors | Licensing of *their* HTML often unclear | Avoid unless PD dedication clear |
| CCEL `.txt` beside ThML | Still CCEL digital edition | Does **not** fix licensing by itself |

- **Effort:** High (months of ingest/OCR/proof for full set).
- **Residual risk:** Low for digital-edition claims if source is truly
  independent PD transcription; Medium until OCR quality and editorial
  notes are scrubbed.
- **Cost:** Lose cheap `{ref}` / div structure unless re-tagged.

### C. Keep CCEL as fetch-time only; ship only derived SQLite; document CCEL terms for fetchers

- **This is mostly today’s engineering posture** (XML gitignored).
- **Effort:** Low (docs + attributions honesty).
- **Residual risk:** Still Medium–High for App Store / paid / “extract
  freely” messaging — the *product* redistributes derived text, which is
  what end users get.
- **Useful as hygiene**, not as a complete fix.

### D. Dual path: PD plaintext for production packs; ThML only for contrib/dev

- **Effort:** High (two pipelines).
- **Residual risk:** Low in production if packs are plaintext-sourced;
  ThML stays behind a “dev only / accept CCEL terms” gate.
- **Good long-term** if A fails and you still want ThML for prototyping.

### E. Drop ANF/NPNF (and optionally Creeds/reformers) from distribution; optional download with CCEL notice

- **Effort:** Medium (pack UX, notices, base pack without Creeds or
  Creeds re-sourced).
- **Residual risk:** Low for Aletheia distribution; product hole for
  patristics.
- Creeds are in **base** today — dropping “optional fathers” alone does
  not clear base.

### F. Other findings

- **CrossWire / SWORD community** has long used CCEL ThML as a *source*
  for learning modules, while debating whether XML copyright claims are
  enforceable; Chris Little (2010) called markup claims dubious and noted
  volunteer markup / earlier “PD” labeling complications
  ([sword-devel thread](http://crosswire.org/pipermail/sword-devel/2010-November/035427.html)).
  That is **opinion**, not a license grant to Aletheia.
- **EarlyFathers**-style third-party SWORD genbooks exist from “public
  domain content”; always read that module’s `DistributionLicense` /
  `TextSource` — do not assume CrossWire hosting = CCEL permission.
- **Project Gutenberg “no sweat of the brow”** essay argues scanning,
  proofreading, and adding markup to PD text do **not** create new US
  copyright
  (<https://www.gutenberg.org/help/no_sweat_copyright.html> — PG’s
  lawyer-informed policy statement). Courts still protect original
  creative additions (new essays, creative selection/arrangement,
  expressive critical apparatus). **Do not overclaim** that ThML → our
  tokens is therefore automatically free of any CCEL interest or
  contract-like site terms.
- **Feist** (*Feist Publications v. Rural Telephone*): facts / sweat-of-
  brow alone are not enough; originality is required. Thin copyright can
  still attach to original expression layered on PD text. Whether CCEL’s
  XML crosses that line, and whether our SQLite is a **derivative** of
  that expression vs an independent extraction of PD words, is the open
  legal question — **uncertain**.
- **App Store:** Guideline 5.2 — only content you created or are
  licensed to use
  (<https://developer.apple.com/app-store/review/guidelines/>).

---

## 6. Recommended next step

**Primary:** Send one permission request via
<https://www.ccel.org/info/email> (and/or `ccel@calvin.edu`) describing
Aletheia, that you discard ThML and ship SQLite + your token dialect,
requested grant (OSS + free App Store ± paid), credit text, and list of
works (ANF, NPNF, Creeds, named reformers). Keep the reply on file.

**Fallback if refused / NC-only / no App Store:** Start Option **B/D** for
Creeds + a pilot ANF volume from Wikisource or IA OCR; keep ThML
fetch behind an explicit contrib warning; stop calling the shipped
fathers packs “license-clean / extract freely” until re-sourced or
permitted.

**Immediate honesty fixes (non-ingest):** Align `AttributionsRoute`,
README, and ABOUT so CCEL-sourced packs are not labeled bare “Public
Domain” without noting CCEL’s digital-edition terms — same candor as
`COMMENTARIES.md`.

---

## 7. Open questions for a lawyer

1. Under US law, does CCEL’s ThML (structure, `scripRef` normalization,
   editorial apparatus) contain protectable original expression, or is
   protection limited to clearly original front matter / notes?
2. Is converting ThML → Aletheia tokens + SQLite a **derivative work** of
   that markup, or only reproduction of PD literary text?
3. Do CCEL website terms create enforceable **contract** limits beyond
   copyright (personal / educational / non-profit; contact before
   republish)?
4. Does distributing a free App Store binary count as “commercial” or
   “large scale republication” under their Vision language?
5. Can Aletheia’s CC0 dedication cover *extracted* PD words while
   excluding any CCEL-originated structure — and how must that be
   documented so third-party extractors are not misled?
6. Non-US distribution (life+70 jurisdictions) for any Schaff apparatus
   still in copyright abroad?

---

## Key URLs

| Resource | URL |
| -------- | --- |
| CCEL copyright policy | https://www.ccel.org/about/copyright.html |
| CCEL Vision (XML assertion) | https://ccel.org/info/vision.html |
| Contact form | https://www.ccel.org/info/email |
| Fathers index | https://www.ccel.org/fathers.html |
| Wikisource ANF | https://en.wikisource.org/wiki/Ante-Nicene_Fathers |
| CrossWire discussion of CCEL XML claims | http://crosswire.org/pipermail/sword-devel/2010-November/035427.html |
| Apple App Store Guideline 5.2 | https://developer.apple.com/app-store/review/guidelines/ |
| In-repo commentary precedent (avoid CCEL) | `data/sources/COMMENTARIES.md` |
