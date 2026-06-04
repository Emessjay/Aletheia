# Aletheia

**Live:** https://readaletheia.com <!-- TODO(patrick): confirm exact URL -->
**GitHub:** https://github.com/Emessjay/Aletheia
**Tier targeted: Gold**

Aletheia is a Bible study app for small groups. Read six public-domain
translations in parallel (English, Greek, Hebrew) with Strong's lexicon
lookups, audio narration, highlights, notes, and bookmarks — then discuss
what you're reading in **study groups**: invite-only spaces where every post
is anchored to a verse, members reply, flag, and moderate, and a "most
discussed passages" board shows where the conversation is happening. The
corpus is deliberately license-clean (public domain / CC0 sources only), so
the whole thing is redistributable with no strings.

The reader works without an account; everything social requires sign-up.
Sign up, create a group, share the invite code, and post on a verse — that's
the core loop.

## Team

<!-- TODO(patrick+jack): adjust wording, but keep it cross-checkable against
     `git log` — the bullets below match the actual commit history. -->

- **Jack Porter** — the corpus pipeline and license vetting, the reader
  engine (parallel columns, continuous scroll, hash-flash), audio narration
  (streaming, caching, autoplay), Strong's/lexicon features, the
  SQLite→Postgres web migration and Railway deployment, and the
  Report-a-bug tab.
- **Patrick Ramsay** — the entire multi-user layer (study-group schema,
  moderation state machine, group/post/flag API, feed UI, polling,
  optimistic updates, display names, Discuss-from-reader, invite-code
  rotation, unflag), auth hardening (ES256/JWKS verification, Postgres RLS
  deny-all), the bug-report security pass, the production
  connection-pooling fix, and the phone-width work across the app.

## Where the nontrivial logic lives

1. **Moderation state machine + authority matrix** —
   `server-py/app/groups/moderation.py`. Every flag/remove/restore/unflag
   decision is two pure functions: *who may do what* (role × authorship)
   and *what state may follow* (a transition table over
   visible/flagged/removed). Design decisions: flagged posts stay visible
   (post-publication moderation, not pre-approval), removed posts remain
   visible to their own author and to moderators (auditability), and author
   self-deletion is deliberately a separate fact from moderator removal so
   the audit trail can't conflate them. Exhaustively unit-tested because it
   has no DB or framework dependency.
2. **Most-discussed-passages digest** —
   `server-py/app/routes/group/digest.py`. Cross-table rollup of posts and
   replies by verse anchor over a trailing window, excluding removed and
   deleted content, with a minimum-posts threshold and a
   volume → distinct-authors → recency tiebreak. The docstring walks through
   each decision.
3. **SQLite-FTS5 → Postgres tsvector rewrite** —
   `server-py/app/db.py::rewrite_fts`. The frontend speaks SQLite FTS5
   because that's the desktop build's native dialect; rather than maintain
   two search implementations, the server rewrites `MATCH`/`snippet()`/
   `ORDER BY rank` into `websearch_to_tsquery`/`ts_headline`/`ts_rank`
   against generated tsvector columns.

## Design decisions

- **Tenancy by membership, not by user id.** Private user data
  (highlights, notes) is scoped `WHERE user_id = $n` on every query; group
  content is shared, so its tenancy rule is "reachable iff you hold a
  `group_membership` row," checked by `get_role()` before anything else.
  Non-members get 404, not 403 — we don't leak whether a private group
  exists.
- **Supabase Auth over rolling our own.** The server verifies the
  Supabase-issued JWT (ES256 via JWKS) and treats `sub` as the user id —
  there is no password handling anywhere in our code. We additionally
  enabled **Postgres RLS deny-all** on every table so the Supabase REST
  surface (reachable with the public anon key) can't read anything even if
  misconfigured — defense in depth.
- **Polling over websockets for the live feed.** Open feeds/threads
  refetch every 5s: payloads are small, the server is one stateless FastAPI
  process, and React Query pauses polling in unfocused tabs. Websockets
  would add a connection-state layer for no perceptible gain at this scale.
- **Display names are joined at read time, not denormalized onto posts.**
  A rename instantly applies to every existing post; the alternative
  (embedding `author_name` per row) goes stale the first time someone
  renames themselves.

## Where agents helped most and where we pushed back

<!-- TODO(patrick+jack): this paragraph must be yours — written in your own
     words, true, and specific. Two candidate stories from the actual build
     log, use/replace/extend as you see fit:
     1. Asked to make phone buttons tappable, Claude grew invisible 42px
        hit areas around visually unchanged 13px controls. Tests passed and
        taps landed, but on a real phone the buttons still *looked*
        unusable — we pushed back with a hands-on phone audit and made the
        controls visibly larger (and found the 16px iOS input-zoom
        threshold in the process).
     2. Claude's first phone layout for the multi-translation reader kept a
        combined header that duplicated the page heading — caught from a
        real device screenshot, not by any test.
     Also note where it helped most (e.g., the moderation state machine +
     its exhaustive tests, the FTS rewrite, diagnosing the Supabase
     EMAXCONNSESSION pooling incident from one error string). -->

## Running locally

```bash
docker compose up -d postgres
pip install -r server-py/requirements.txt
cp .env.example .env                # set SUPABASE_* for auth-gated features
(cd server-py && DATABASE_URL=postgresql://aletheia:aletheia@localhost:5432/aletheia alembic upgrade head)
DATABASE_URL=postgresql://aletheia:aletheia@localhost:5432/aletheia python3 -m app.scripts.ingest_corpus
npm install && npm run build
DATABASE_URL=postgresql://aletheia:aletheia@localhost:5432/aletheia uvicorn app.main:app --app-dir server-py
```

Tests: `npm test` (vitest, 185) and
`DATABASE_URL=... python3 -m pytest server-py -q` (pytest, ~100 across
unit/integration/acceptance). CI runs both on every push and PR against a
Postgres service container; deploys wait for green.

## Gold

- **Pick-one: real-time-ish updates** via 5-second polling on open feeds
  and threads (see the polling design decision above for why
  polling-over-push fits this app).
- **Custom features:**
  - **Scripture autolink** — verse references typed in post bodies become
    deep links into the reader.
  - **Discuss-from-reader** — a verse's toolbar jumps straight into the
    group feed pre-anchored to that verse (and back).
  - **Invite-code rotation** — moderators can mint a fresh code when one
    leaks; the old code stops admitting immediately, members are
    unaffected.
  - **Unflag** — a flagger can withdraw a standing flag; the post recovers
    only when the last flag is withdrawn and no moderator has acted.
- Phone support is a first-class pass, not a media-query afterthought:
  stacked per-verse translation layout below 520px, 44px controls, 16px
  inputs (iOS zoom threshold), and the whole app audited on a real device.

## About the app itself

Corpus sources, licensing policy, and the desktop (Tauri) build are
documented in [docs/ABOUT.md](docs/ABOUT.md).
