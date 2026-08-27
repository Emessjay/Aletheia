# Aletheia corpus formatting rules

North star: **readable hierarchy in the sidebar, scannable chapter headings, comfortable paragraph flow.** These rules apply to every section-based corpus (ANF, NPNF, reformers, commentaries, Summa, creeds) and to the React renderer that displays them.

---

## 1. Sidebar taxonomy

### What appears

| Corpus | Sidebar lists | Hidden (rendered inline on the page) |
|--------|---------------|-------------------------------------|
| ANF / NPNF / reformers / creeds | Every navigable section row (`chapter`, `section`, `discourse`, …) | — |
| Summa | `part`, `question`, `article`, `intro` only | `objection`, `sedcontra`, `respondeo`, `reply` (shown under the article) |
| Commentaries | Book → chapter list (separate route); no section sidebar on chapter view | Verse-level `comment` rows (panel UI) |

### Depth and indentation

- Indentation follows `ordinal_path` depth: `padding-left = 18px + (segmentCount − 2) × 10px`.
- Practical max depth: **4 segments** below the work slug (e.g. `summa.prima.q1.a3` → 3 visible indent steps). Deeper paths are rare; do not flatten them.

### Label display (sidebar, prev/next, breadcrumb)

1. **Shorten for scanability** — cap at 80 characters or first sentence-ending punctuation (`.`, `!`, `?`), whichever is shorter. Full label stays in the `title` attribute.
2. **Show rubric only in breadcrumbs** — split `Chapter VI.—Caption` and use only the rubric (`Chapter VI.`) in the sticky trail; caption renders in the page `<h1>`.
3. **Series eyebrow** — CCEL volume slugs map to human tags: `ANF I`, `NPNF¹ IV`, etc.; never show raw slugs like `anf01.justin-martyr` in UI chrome.
4. **Drop duplicate body-as-label** — if normalized body text equals normalized label, do not re-render the label as a paragraph (container sections).

### Container vs leaf

- **Container kinds** (`part`, `question`, `article`, `intro`): page shows child sections inline; body may be empty after heading strip.
- **Leaf kinds** (`chapter`, `section`, `comment`, scholastic sub-kinds): body carries the readable text.

---

## 2. Section label format

### Canonical patterns

| Pattern | Example | Notes |
|---------|---------|-------|
| Chapter + caption | `Chapter VI.—Charge of atheism refuted.` | Em/en dash between rubric and caption |
| Ordinal only | `Discourse IV` | Ingest synthesizes caption from first body sentence |
| Section (reformers) | `Section XLI.—First of all, …` | Long captions (>70 chars or trailing `…`) suppressed in page heading |
| Summa article | `Whether God exists?` | Question text is the label |
| Commentary verse | `Verse 12` / `Verses 1–3` | Matthew Henry ranges; SWORD single-verse labels |
| Book (commentary tree) | `gen` (slug) | Resolved to canonical book name in UI queries |

### Normalization rules (ingest + display)

1. Collapse internal whitespace to single spaces.
2. Strip trailing editorial fragments: ` — Sect`, ` — Cap`, ` — Ch`, etc.
3. Strip empty caption stubs: `: —`, `— : —`, lone `: —` after rubric.
4. Roman numerals in structural rubrics stay Roman (`Chapter I`, not `Chapter 1`) — matches printed Schaff editions.
5. Synthesized labels from body snippets: first sentence, max ~100 characters, ellipsis when truncated; never include inline markup tokens.
6. Work titles: title-case predominantly-uppercase CCEL div1 titles; bare author names become `Writings of <Father>`.

---

## 3. Body markup token vocabulary

**Single source of truth:** ingest emits tokens; `SectionBody.tsx` parses them. Keep `ThMLParser.swift` header comment and `SectionBody.tsx` block comment in sync.

| Token | Meaning | Source |
|-------|---------|--------|
| `{ref:Passage}…{/ref}` | Scripture citation link | ThML `<scripRef passage="…">` |
| `{em}…{/em}` | Italic emphasis | `<i>`, `<em>` |
| `{b}…{/b}` | Bold | `<b>` |
| `{q}…{/q}` | Block or inline quote | `<q>` |
| `{h2}…{/h}` / `{h3}…{/h}` / `{h4}…{/h}` | In-body subheading | `<h2>`–`<h4>` after first chapter heading |
| `{fn:N}…{/fn}` | Editor footnote | `<note place="end" n="N">` |

### Paragraph rules

- **Paragraph break:** `\n\n` (double newline).
- **Single newlines:** collapsed to spaces (printed line-wrap, not semantic breaks).
- **Migne markers:** split `N. Capital` after sentence-ending punctuation into a new paragraph (renderer heuristic).
- **Em-dash blockquotes:** paragraphs matching `^— … —$` render as `<blockquote>` (Luther/Calvin convention).

### Plain-text corpora (commentaries)

Commentary ingest stores plain prose with `\n\n` paragraph breaks only — no inline tokens. The shared renderer treats token-less bodies as normal paragraphs and still linkifies scripture references in prose.

---

## 4. Typography and CSS

| Element | Convention |
|---------|------------|
| Series eyebrow | `.al-eyebrow` — 11px, letterspaced small-caps, muted |
| Page `<h1>` rubric | 24px semibold; caption 18px italic muted underneath |
| In-body `{h2}` / `{h3}` / `{h4}` | 19 / 17 / 16 px semibold; `{h4}` muted |
| Body paragraphs | `.al-section-body p` — line-height 1.55, 0.9em bottom margin |
| Block quotes | Left rule 2px, italic, 1em padding-left |
| Scholastic sub-kinds | Uppercase eyebrow (`Objection 1`, `I answer that`) — not `<h2>` |
| Patristic sub-sections | `<h2>` at 19px |
| Footnotes | `<aside>` below body, 14px muted, numbered superscript anchors |
| Scripture refs | Global link styling (accent + thin underline); `{ref}` uses passage attribute |

Language: set `lang` on the body wrapper (`en`, `la`, `grc`) when known.

---

## 5. Edge cases

| Case | Handling |
|------|----------|
| Editorial front matter (translator notes, `[a.d. …]`, horizontal rules) | Strip from body during ingest (`stripLeadingHeadingParagraphs`) |
| Indexes, title pages, prolegomena | Omit from `discoverWorks`; never appear as navigable works |
| Synthesized long labels (Luther) | Show rubric only in `<h1>`; suppress caption when >70 chars or ends with `…` |
| Duplicate label in body | Strip at ingest; suppress at render via `hasMeaningfulBody` |
| Container-only sections (Confessions books) | Empty body OK; navigate by label |
| Summa Latin-only subsections | Merge en/la children by `ordinal_path`; prefer English |
| Commentary book intro at Gen 1:1 | SWORD parser splits preface from verse-1 commentary |
| Unmatched markup tokens | Tolerate silently (unclosed tags stay open; stray closers ignored) |

---

## Implementation map

| Concern | Location |
|---------|----------|
| Token emit | `tools/ingest/.../ThMLParser.swift` |
| Label normalize | `ThMLParser.normalizeSectionLabel`, `headingSnippet`, `stripLeadingHeadingParagraphs` |
| Commentary tree | `MatthewHenryParser`, `SwordCommentaryParser`, `Pipeline.swift` |
| Summa kinds | `SummaParser.swift` |
| Label display helpers | `src/domain/sectionLabels.ts` |
| Body render | `src/components/SectionBody.tsx` |
| Resources chrome | `src/features/patristics/PatristicsRoute.tsx` |
| Commentary chrome | `src/features/commentaries/CommentariesRoute.tsx` |

---

## Reingest after label-normalization changes

ThML label cleanup is written at ingest time. Refresh affected packs without
re-running the heavy bible merge:

```bash
./scripts/reingest-packs.sh anf npnf reformers creeds
```

Use `creeds` (not `base`) for Schaff *Creeds of Christendom* only. Frontend
display-time normalization in `sectionLabels.ts` applies immediately without
reingest.
