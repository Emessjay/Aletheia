# Contributing to Aletheia

Thanks for your interest. This guide covers the practical bits: how to lay out
your checkout, run the app, run the tests, and what we will and won't accept
into the bundled corpus.

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Worktrees, not branches in a single checkout

Aletheia uses a **worktree-per-feature** convention. Each non-trivial feature
gets its own checkout on its own branch, in its own directory next to the main
clone. The helper script handles the layout and `npm install`:

```sh
./scripts/new-worktree.sh <slug>
```

That creates `../aletheia-<slug>` on branch `feature/<slug>`. Do all editing,
building, and testing inside that directory. When the feature lands, merge
from the main checkout and remove the worktree:

```sh
git merge feature/<slug> && git worktree remove ../aletheia-<slug> && git branch -d feature/<slug>
```

The primary reason for the convention is isolation between concurrent editors
(human or AI) — a shared checkout lets one session read another's
half-written code. The secondary reason is that parallel `tauri dev`
processes collide on the Vite port, the single-instance lock, and the macOS
app-data directory. See [CLAUDE.md](CLAUDE.md) for the full rationale.

## Running the app

Always launch the desktop app through the wrapper, never `npm run tauri dev`
directly:

```sh
./scripts/dev-instance.sh        # picks the lowest free instance index
./scripts/dev-instance.sh 3      # or pin to instance #3
```

The wrapper overrides the Tauri bundle identifier and Vite port per instance
so multiple dev windows can run side by side without stomping on each other's
user-data SQLite.

## Running the tests

From inside your worktree:

```sh
npm test                         # Vitest unit suite
npx tsc -b                       # TypeScript project build
cd src-tauri && cargo check      # Rust shell type-check
cd tools/ingest && swift test    # Ingest CLI parser tests
```

A pull request should leave `npm test` and `npx tsc -b` green.

## Corpus licensing policy

The bundled SQLite corpus (`data/Aletheia.sqlite`) is held to a strict
no-strings standard so anyone can extract and redistribute it freely. When
sourcing new content, ranked preference is:

1. **Public domain by age** (pre-1929 works, ancient texts).
2. **CC0 / Unlicense / explicit PD dedication.**
3. **CC BY** — only when no PD equivalent exists; requires a credit entry.
4. **CC BY-SA, CC BY-NC, GPL** — avoid. ShareAlike is viral; NC blocks reuse.
5. **All-rights-reserved or unlicensed digital editions** — never bundle.

Verify the *digital edition's* license, not just the underlying work — a
PD-by-age text can still ship under CC BY if the transcriber asserts rights
over the markup. See [CLAUDE.md](CLAUDE.md) for the full policy and the list
of sources already vetted (or rejected).

## Adding a Bible translation

Two touch-points:

- Translation metadata, code, script, and display name live in
  [src/domain/translations.ts](src/domain/translations.ts).
- The text itself is ingested by the Swift CLI under
  [tools/ingest/](tools/ingest/), which writes into the bundled SQLite
  corpus. Add a parser for the upstream format, wire it into the ingest
  entry point, and rebuild the corpus.

The source must satisfy the corpus licensing policy above.

## Adding a top-level tab

Top-level navigation tabs live under `src/tabs/`. Add a new tab module there
and register it in the app shell.

## Commit messages

Imperative mood. Explain *why*, not just *what* — the diff already shows what
changed. One-line summary, blank line, body if needed. Bad: "update reader".
Good: "reader: collapse adjacent verse refs so footnote anchors don't wrap".

## Multi-agent build assistant

The repo ships with an in-tree multi-agent build-assistant system (an
"auditor" supervisor and parallel "workers") used by the maintainer when
working with Claude Code. Contributors are **not** required to use it — it
is purely a productivity tool for the maintainer. If you are curious, the
handbooks are [AUDITOR.md](AUDITOR.md) and [WORKER.md](WORKER.md).
