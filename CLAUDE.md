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
  (`src-tauri/src/audio.rs`), Python (`server-py/app/routes/audio.py`). A
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

## Web/Railway deployment (FastAPI + Postgres)

The same React frontend runs in two hosts: the Tauri desktop build (`npm run
tauri build` or `./scripts/dev-instance.sh` for dev) and a FastAPI API server
under `server-py/` that serves the corpus over HTTP plus the static frontend.
The FastAPI server is what gets deployed to Railway via the repo-root
`Dockerfile` (referenced by `railway.toml`).

Two hosts, two storage layers:

- **Tauri desktop** reads the bundled `data/Aletheia.sqlite` directly via
  `tauri-plugin-sql`. The SQLite file is the canonical corpus artifact —
  it's the source the ingest script reads from.
- **FastAPI web** reads from **Postgres** (asyncpg) via `app.state.pool`.
  The Docker image no longer bundles `Aletheia.sqlite`; instead Railway
  provides a Postgres database, the container runs `alembic upgrade head`
  on every start to apply the schema, and a one-off
  `python -m app.scripts.ingest_corpus` loads the data.

Phase 2 (this PR) is the corpus-to-Postgres migration. Phase 3 wires
Supabase Auth and moves web user-data off sql.js.

### Web ingest trim (Supabase free tier)

Three corpus tables are deliberately skipped in the web Postgres ingest
to stay under Supabase's free-tier disk quota (they sit in
`TRUNCATE_EXTRA` in `server-py/app/scripts/ingest_corpus.py` —
truncated but never reloaded):

- `xref` (~344k rows; Treasury of Scripture Knowledge cross-refs)
- `section` (~122k rows; Schaff ANF/NPNF + Aquinas patristic bodies —
  also the storage for ingested Bible commentaries like Matthew Henry /
  Calvin / JFB / Wesley / Clarke, so both the Patristics *and*
  Commentaries tabs depend on it)
- `citation` (FK to section; empty in source anyway)

The schema still defines them (so queries don't blow up), the tables
are empty on Postgres, and the `CrossRefs` popup in the verse toolbar
renders an "available in the desktop app" hint when it sees empty
data. Tauri's bundled SQLite has the full corpus; nothing changes
there.

`word` (~1M rows; Strong's interlinear) **is** ingested on web — the
Hebrew/Greek interlinear columns work in the deployed build. After
re-adding `word`, the deployed DB lands around ~312MB, comfortably
under the 500MB free-tier cap with ~190MB of headroom for user-data
growth.

The Patristics *and* Commentaries top-level tabs are hidden on the
web build via the `HIDDEN_ON_WEB` set in `src/tabs/registry.tsx`,
keyed off `getPlatform().info.isDesktop`; direct `/patristics/*` and
`/commentaries/*` URL hits fall through to the 404 catch-all. Bible
reader, search, highlights, notes, libraries, audio, Strong's lexicon,
and Strong's interlinear all function on web. Tauri's bundled SQLite
has the full corpus and both tabs work unchanged on desktop. Mirror
case: the `bug-report` tab is web-*only* (in `DESKTOP_HIDDEN`,
the inverse of `HIDDEN_ON_WEB`) — desktop users have direct file
access, so their bug channel is handled separately.

To re-enable patristics/commentaries/xref on web, either (a) upgrade
to Supabase Pro (8GB) and move `xref`, `section`, `citation` from
`TRUNCATE_EXTRA` back into `INGEST_ORDER` (and remove `patristics`
and `commentaries` from `HIDDEN_ON_WEB`), or (b) migrate to a larger
Postgres tier elsewhere.

### FTS routing (option a — server-side rewrite)

The frontend speaks SQLite FTS5 — `WHERE verse_fts MATCH $1`,
`snippet(verse_fts, ...)`, `ORDER BY rank` — because that's the dialect the
Tauri build natively supports. Rather than introduce a typed search endpoint
that would need parallel implementations on Tauri and web, the FastAPI
corpus router rewrites the incoming SQL: `verse_fts MATCH $N` becomes
`v.search_vector @@ websearch_to_tsquery('english', $N)`, `snippet(...)`
becomes `ts_headline(...)`, and `ORDER BY rank` becomes
`ORDER BY ts_rank(...) DESC`. The transformation lives in
`server-py/app/db.py::rewrite_fts`. The `verse.search_vector` and
`section.search_vector` columns are Postgres `GENERATED ALWAYS … STORED`
tsvectors over the same text fields the SQLite FTS5 virtual tables indexed
(`text_plain`, `body`), with `GIN` indexes for query performance.

### Running the server locally

    docker compose up -d postgres                              # phase-2 dep
    pip install -r server-py/requirements.txt
    cp .env.example .env                                       # edit if needed
    cd server-py && DATABASE_URL=$DATABASE_URL alembic upgrade head
    cd .. && DATABASE_URL=$DATABASE_URL python3 -m app.scripts.ingest_corpus  \
        # one-shot; ~75s against the bundled SQLite
    npm run build                                              # produces dist/
    DATABASE_URL=$DATABASE_URL uvicorn app.main:app --reload --app-dir server-py

Visit `http://localhost:8000` (or pass `--port 3000` to match the Docker
image). The server requires `DATABASE_URL` and fails fast if it can't open
the pool. The ingest script's source SQLite path defaults to
`data/Aletheia.sqlite` (override with `ALETHEIA_CORPUS_PATH`). Audio cache
goes under `/tmp/aletheia-audio` (override with `ALETHEIA_AUDIO_CACHE`).
The built frontend is picked up from `dist/` unless `ALETHEIA_STATIC_DIR`
points elsewhere.

### Ingest on Railway

The Dockerfile deliberately does **not** run `ingest_corpus.py` on every
start — that would re-truncate-and-reload the corpus on every cold start.
After the first Railway deploy stands up an empty Postgres, run the ingest
once via a Railway one-off job (or by exec'ing into the container):

    railway run python -m app.scripts.ingest_corpus

The script is idempotent (TRUNCATE … CASCADE + bulk COPY), so re-running
it is safe but slow; only do so when the bundled SQLite has changed.

### Test gate

The test gate (`.nimbus-test-command`) spins up the local Postgres,
chains the vitest suite with the pytest suite, and uses
`DATABASE_URL=postgresql://aletheia:aletheia@localhost:5432/aletheia` by
default. Any FastAPI change needs both pytest (acceptance + integration)
and vitest to stay green.

## Auth (phase 3a backend)

The web build authenticates end-users with Supabase Auth. The FastAPI
server verifies the Supabase-issued JWT and treats the `sub` claim as the
user's UUID — there is no user table on our side, just a `user_id UUID`
column on every per-user row.

Contract:

- Frontend sends `Authorization: Bearer <jwt>` on every `/api/user/*`
  request (phase 3b will wire this from supabase-js).
- The dependency `get_current_user_id` in `server-py/app/auth.py`
  verifies HS256 against `SUPABASE_JWT_SECRET`, requires
  `aud == "authenticated"` (Supabase's default end-user audience), and
  returns the `sub` UUID.
- Any failure (missing header, malformed token, bad signature, expired,
  wrong audience) → `401`. A request with a valid JWT referencing a row
  belonging to another user → `404` (don't leak existence of other
  users' rows).
- `SUPABASE_JWT_SECRET` is read at app start and cached on
  `app.state.jwt_secret`. If unset, `/api/health` + `/api/corpus` still
  work; `/api/user/*` returns `503 "auth not configured"`. Find the
  secret in Supabase: *Settings → API → JWT Settings → JWT Secret*.

**Tauri stays local-first.** The new Postgres tables (`library`,
`bookmark`, `highlight`, `note`, `kv`) are for the web build only. The
desktop build keeps reading/writing its bundled `aletheia_user.db` via
`tauri-plugin-sql` and never sends a JWT. Tauri code paths under
`src/platform/tauri/` and `src-tauri/` are untouched by phase 3a.

**Scoping invariant.** Every SQL statement issued by
`server-py/app/routes/user/*` binds `user_id` as a parameter and
constrains the row to `WHERE user_id = $N`. There is no unscoped
mutation or read against the user-data tables. If you find yourself
about to write `DELETE FROM highlight WHERE id = $1` without a
`user_id = $2` clause, stop — that's a tenancy bug.

## Auth (phase 3b frontend)

`src/auth/` is the entire auth surface on the React side:

- `client.ts` — module-level Supabase client built from
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`. If either is missing, the
  module exports a stub whose every method either no-ops (`getSession`,
  `onAuthStateChange`) or rejects with `"auth not configured"` — dev can
  still boot without Supabase set up. Also exports
  `getAccessToken()`, an async helper that returns the current JWT (or
  null when signed out) and is the only thing the HTTP adapter reads.
- `AuthProvider.tsx` + `useAuth()` — React context. State is
  `{ session, status: "loading" | "anonymous" | "authenticated" }`. The
  provider wraps the app at the top of `src/AppShell.tsx`.
- `AuthScreen.tsx` + `useAuthScreen` — a small zustand store that any
  CTA can call to pop the email+password modal. The screen has two tabs
  ("Sign in" / "Create account"), surfaces errors inline, and shows a
  confirmation notice after sign-up (Supabase's default flow requires
  email confirmation).
- `AuthMenu.tsx` — the top-right corner control: a "Sign in" button when
  anonymous, the user's email + a "Sign out" dropdown when authenticated.
  Hidden on the Tauri build (`getPlatform().info.isDesktop`) because the
  desktop adapter is local-first and never holds a Supabase session.
- `SignInCta.tsx` — the inline "Sign in to <verb>" link used by every
  write-gated surface (notes editor, bookmark picker, library creator,
  the highlight popover).

The web `UserDataAdapter` is typed-method per `/api/user/*` endpoint
(see `src/platform/types.ts`); the adapter handles snake_case ↔ camelCase
translation and Bearer-JWT attachment so feature code never builds an
HTTP request or sees a token. Tauri's adapter exposes the same typed
interface and translates internally to plugin-sql against
`aletheia_user.db`, so the rest of the codebase is host-agnostic. There
is no raw SQL on the wire from the web build — that's the rationale for
the typed surface, since shipping arbitrary SQL strings to a public API
would either bypass per-user scoping or require server-side SQL parsing.

**Anonymous browsing is allowed.** The corpus is public, so reader /
search / audio / patristics work without a session. Writes are gated:
every create/update/delete CTA either pre-checks `status` or catches
`AuthRequiredError` from the adapter and pops `AuthScreen`. Silent
failure is the wrong behavior — the user must know sign-in is required.

**IndexedDB orphan note.** Phase 3b deletes the prior sql.js + IndexedDB
web user-data path. Existing IndexedDB data is intentionally orphaned —
the user reported that the previous web highlights weren't actually
working, and the simplest cut was to drop the migration entirely. A
future worker can add a one-time prompt that exports the orphan blob
and POSTs it to `/api/user/*` if anyone turns out to have real data
there. Tauri user-data is unaffected.

**Env vars.** `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are read at
import time. CI sets dummy values so vitest + `tsc -b` + `vite build`
pass; tests mock the supabase client at the boundary
(`vi.mock("@/auth/client", …)`), so the dummy values never need to be
real.

## Reader: continuous scroll

The Bible reader doesn't show one chapter at a time — it keeps a bounded
"chapter stack" in the DOM and lets the user scroll between chapters
continuously. ReaderRoute composes one `<ChapterSection>` per loaded
chapter; everything chapter-scoped (verses, annotations, interlinear,
selection, the `data-verse-anchor` targets used by the `#v<N>` flash)
lives inside the section component.

- **Stack model** — `src/features/reader/useChapterStack.ts`. Pure
  reducer + canon-derived `nextChapterKey` / `prevChapterKey` (advances
  within a book, crosses to the next book's chapter 1 at the tail,
  returns null at the canon boundary). Cap is `MAX_CHAPTERS = 7`;
  appending past the cap drops the topmost chapter, prepending drops
  the bottommost.
- **Triggers** — two `IntersectionObserver`s in ReaderRoute. One watches
  per-section visibility (used to pick the "current" chapter for URL +
  audio sync); the other watches sentinel elements above the first
  section and below the last to fire prepend / append.
- **Scroll anchor on prepend** — `useLayoutEffect` captures the
  topmost section's bounding rect *before* the new chapter renders,
  then adjusts `scrollTop` after so the user's reading position
  doesn't shift. Don't lean on CSS `scroll-anchoring: auto` — it
  fights our fixed-bottom audio bar on Safari.
- **URL sync** — `history.replaceState` (not router push) on the
  current chapter, throttled to ~4 Hz. A single Back press takes
  the user wherever they came from, regardless of how many chapters
  they scrolled through.
- **Audio freeze while playing** — `AudioPlayer` surfaces playback
  state via `onPlayingChange`. While audio is playing the
  "operating chapter" for the player is frozen on whatever file is
  actually playing; scroll only re-targets the player when audio is
  paused or stopped. Prevents yanking the listener mid-narration.
- **Hash flash** — the existing `#v<N>` scroll-and-flash from
  `verseFlash.css` is preserved, scoped via per-section
  `data-verse-anchor` so the same verse number in different
  loaded chapters doesn't collide on the DOM `id` namespace.
- **Selection containment** — highlight gestures that cross chapter
  boundaries are intentionally ignored. Documented in
  ChapterSection; a future enhancement could span sections, but the
  current bar is single-chapter only.

The Tauri build uses the same stack — there's no platform branching in
ReaderRoute. The stack just reads from `getPlatform().corpus` like the
rest of the reader.

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
