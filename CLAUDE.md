# Aletheia — Claude project notes

## Auditor system

The agent role handbooks (`AUDITOR.md`, `WORKER.md`, `DEBUGGER.md`,
`LIGHTWEIGHT.md`) live in the **Nimbus orchestration repo**, not in
this repo. From Aletheia's root, they are at:

    ../../Nimbus-workspace/Nimbus/

If you were booted by `aletheia-audit` (env `ALETHEIA_ROLE=auditor`),
read [../../Nimbus-workspace/Nimbus/AUDITOR.md](../../Nimbus-workspace/Nimbus/AUDITOR.md)
— you are the supervisor and a PreToolUse hook will block you from
editing source code. If you were booted by `aletheia-worker` inside an
`aletheia-<slug>/` worktree, read
[../../Nimbus-workspace/Nimbus/WORKER.md](../../Nimbus-workspace/Nimbus/WORKER.md)
— you are a worker and report status via `./scripts/worker-done.sh`
and `./scripts/worker-blocked.sh`. The Nimbus handbooks are written
for a generic "home repo" — this repo (Aletheia) is the home repo;
project-specific hygiene lives in the rest of this file. Either way,
the rest of this file still applies.

## Project conventions (single source of truth)

Three registries / abstractions exist specifically to make OSS contributions
safe. If you find yourself editing the same concept in two places, you are
probably bypassing one of them — stop and look:

- **Main tabs** — `src/tabs/registry.ts`. Adding a new top-level tab is a
  single entry in `MAIN_TABS`. Both `src/AppShell.tsx` (nav) and
  `src/routes.tsx` (router) iterate this array; do not hard-code a tab in
  either. Tabs declare their `routes`, their `matchPrefix`, and any
  `shellFeatures` (e.g., `readerSidebar: true`) they want from the shell.

- **Translations** — `src/domain/translations.ts`. The `TRANSLATIONS` array
  is the only place translation ids carry metadata (`hasStrongs`,
  `hasAudio`, `direction`, `isCommentaryReference`, etc.). Never inline
  a translation id; route through `getTranslation()`,
  `translationsInOrder()`, `audioTranslations()`, or
  `commentaryReferenceTranslation()`.

  The audio allow-list is intrinsically duplicated across three
  languages — TypeScript (`hasAudio` flag), Rust
  (`src-tauri/src/audio.rs`), Node (`server/src/routes/audio.ts`). A
  Vitest parity test in `src/domain/translations.test.ts` reads the two
  non-TS sources as text and asserts they match the registry. If you
  flip `hasAudio`, update both other sites or CI will fail loudly.

- **Platform adapter** — `src/platform/`. Feature code talks to its host
  environment (filesystem, SQLite, audio source files, native window
  chrome) through `getPlatform()`, never by importing `@tauri-apps/*` or
  `fetch("/api/...")` directly. The desktop adapter lives at
  `src/platform/tauri/`; the browser adapter (HTTP shim + sql.js
  + localStorage) lives at `src/platform/web/`. The selector probes for
  `__TAURI_INTERNALS__` on `window` at runtime, so a single Vite bundle
  serves both hosts.

  Web user-data uses sql.js (SQLite-in-WASM) over IndexedDB. Gotcha: the
  Tauri plugin-sql layer accepts Postgres-style `$N` placeholders, but
  sql.js wants SQLite's `?N`; `src/platform/web/userData.ts` rewrites
  one to the other transparently. Keep the SQL strings in
  `src/db/user.ts` using `$N` — that is the shared dialect.

## Web/Railway deployment (FastAPI)

The same React frontend runs in two hosts: the Tauri desktop build (`npm run
tauri build` or `./scripts/dev-instance.sh` for dev) and a FastAPI API server
under `server-py/` that serves the corpus over HTTP plus the static frontend.
The FastAPI server is what gets deployed to Railway via the repo-root
`Dockerfile` (referenced by `railway.toml`).

Phase 1 (this PR) is the API rewrite only — the corpus is still bundled
SQLite, and there is no auth. Phase 2 migrates the corpus to Postgres
(Alembic). Phase 3 wires Supabase Auth and moves web user-data off sql.js.

To run the server locally:

    pip install -r server-py/requirements.txt
    npm run build       # produces dist/
    uvicorn app.main:app --reload --app-dir server-py

Visit `http://localhost:8000` (or pass `--port 3000` to match the Docker
image). The server expects `data/Aletheia.sqlite` at the repo root (override
with `ALETHEIA_CORPUS_PATH`) and writes audio cache under `/tmp/aletheia-audio`
(override with `ALETHEIA_AUDIO_CACHE`). The built frontend is picked up from
`dist/` unless `ALETHEIA_STATIC_DIR` points elsewhere.

The test gate (`.nimbus-test-command`) chains the vitest suite with the pytest
acceptance suite, so any FastAPI change needs both to stay green.

## Worktree-per-feature

Before starting work on any non-trivial feature, create a git worktree for it
and do all editing + testing inside that worktree.

Use the helper script — it creates the worktree on `feature/<slug>` and runs
`npm install` so the new checkout is ready to build:

    ./scripts/new-worktree.sh <slug>

When the feature is complete, commit the work *inside the worktree* before
handing off — do not leave uncommitted changes for the user to merge, since a
`git merge` of an unchanged branch is a no-op. Then give the user a single
combined command they can paste from the main worktree to merge and clean up:

    git merge feature/<slug> && git worktree remove ../aletheia-<slug> && git branch -d feature/<slug>

Alongside that, also give the user a command to launch the merged build so
they can verify the feature end-to-end from the main worktree. Default to:

    ./scripts/dev-instance.sh

If the feature can only be exercised through a more specific entry point
(e.g. a CLI script, a particular route, or an ingest step), suggest that
command instead — the goal is for the user to actually see the change
working, not just confirm it compiles.

The primary reason is isolation between concurrent Claude instances: working in
a shared checkout means one instance can read another's partially-written code
mid-edit, leading to confused state and conflicting changes. A worktree gives
each instance its own filesystem view and its own branch. The secondary reason
applies only when running the Tauri app: parallel `tauri dev` instances
otherwise collide on the Vite port, the Tauri single-instance lock, and the
macOS app-data directory. **Never run `npm run tauri dev` directly** inside a
worktree — always launch via:

    ./scripts/dev-instance.sh        # auto-picks the lowest free instance index
    ./scripts/dev-instance.sh 3      # or pin to instance #3 explicitly

The script overrides the Tauri bundle identifier to `org.jackporter.aletheia.devN`
and picks Vite port `1420 + 2N`, so each instance has an isolated user-data
SQLite under `~/Library/Application Support/`. Without this, the
`tauri_plugin_single_instance` lock in [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
will refuse to launch a second window.

When launched from a linked worktree (detected by `.git` being a file rather
than a directory), `dev-instance.sh` also exports `VITE_ALETHEIA_WORKTREE` with
the worktree slug — the cwd basename minus the `aletheia-` prefix. `AppShell`
reads this and renders it in the top-right so you can tell parallel dev
windows apart at a glance. The main checkout leaves it unset and shows
nothing. If you rename a worktree directory or change the `aletheia-<slug>`
convention in [scripts/new-worktree.sh](scripts/new-worktree.sh), update the
prefix-stripping logic in [scripts/dev-instance.sh](scripts/dev-instance.sh)
to match.

### Running tests inside a worktree

Because the Bash tool's working directory does not reliably persist between
calls, **always target the worktree explicitly** when running tests, builds, or
the dev instance — never assume a previous `cd` is still in effect.

Use a single `cd … && …` invocation so the directory change and the command
are bound together in the same shell call. Worktrees live next to the main
checkout, so from the main Aletheia directory the path is `../aletheia-<slug>`.

To visually exercise the feature, use `./scripts/dev-instance.sh` from inside
the worktree — that's the one and only correct way to launch a parallel dev
build (it allocates a unique Vite port, a unique Tauri bundle identifier, and
a unique user-data SQLite under `~/Library/Application Support/`). Never use
`npm run tauri dev` directly:

    cd ../aletheia-<slug> && ./scripts/dev-instance.sh

For the unit suite and other build steps:

    cd ../aletheia-<slug> && npm test
    cd ../aletheia-<slug> && npm run build
    cd ../aletheia-<slug> && npx tsc -b
    cd ../aletheia-<slug>/src-tauri && cargo check

Hand the user the same form — assume they're already in the main Aletheia
directory rather than spelling out absolute paths.

Never split the `cd` and the command across two Bash tool calls — the second
call will silently run from the main worktree and pick up the wrong sources.

### Merge conflicts

If a merge from `main` into your feature branch produces a conflict, do **not**
assume `main` looks the way it did when you branched — other Claude instances
may have landed features in parallel. Read both sides of every conflict hunk
carefully and preserve the new work on `main` alongside your own changes.
Resolving a conflict by discarding the incoming side is almost never correct;
when in doubt, inspect the `main`-side commit (`git log -p` on the conflicting
file) to understand what feature it was implementing before deciding how to
combine.

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

- **First1KGreek / OpenGreekAndLatin** — CC BY-SA 4.0. Viral; never bundle. Greek
  patristic originals are out of scope: ship English-only translations from the
  PD Schaff ANF/NPNF editions in `data/sources/patristics/`.
- **Corpus Thomisticum** — "iura omnia asservantur." Not redistributable. The
  README's "non-commercial w/ attribution" line understates the restriction.
- **CCAT / CATSS LXX** — user-declaration requirement; treat as non-PD.
- **SBLGNT, Tyndale House GNT, BHS, Rahlfs-Hanhart, Göttingen LXX** — copyrighted.
