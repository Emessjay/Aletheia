# Aletheia

**Live:** https://readaletheia.com
**GitHub:** https://github.com/Emessjay/Aletheia
**Tier targeted: Gold**

Aletheia is a Bible study app for small groups. You can read six public
domain translations in parallel (English, Greek, Hebrew) with Strong's
lexicon lookups, audio narration, highlights, notes, and bookmarks. Study
groups are invite-only spaces where every post is anchored to a verse.
Members reply, flag, and moderate, and a "most discussed passages" board
shows where the conversation is. All corpus sources are public domain.

The reader works without an account. Everything social requires sign-up.
Sign up, create a group, share the invite code, and post on a verse.

## Team

- **Jack Porter** wrote the corpus pipeline and license vetting, the reader
  engine (parallel columns, continuous scroll), audio narration (streaming,
  caching, autoplay), the Strong's lexicon features, the SQLite to Postgres
  web migration, the Railway deployment, and the bug report tab.
- **Patrick Ramsay** wrote the multi-user layer (study group schema,
  moderation state machine, group/post/flag API, feed UI, polling,
  optimistic updates, display names, Discuss from reader, invite code
  rotation, unflag), the auth hardening (ES256 JWT verification, Postgres
  RLS), the bug report security pass, the production connection pool fix,
  and the phone layout work across the app.

## Where the nontrivial logic lives

1. **Moderation state machine and authority matrix** in
   `server-py/app/groups/moderation.py`. Every flag, remove, restore, and
   unflag decision goes through two pure functions. One checks who may act
   (role and authorship), the other checks what state may follow (a
   transition table over visible/flagged/removed). Flagged posts stay
   visible while they wait for a moderator. Removed posts stay visible to
   their own author and to moderators so the record of what happened is
   kept. An author deleting their own post is recorded separately from a
   moderator removing it. The module has no database or framework
   dependency, so the unit tests cover every role, status, and action
   combination.
2. **Most discussed passages digest** in
   `server-py/app/routes/group/digest.py`. A rollup of posts and replies
   by verse anchor over a trailing window. It excludes removed and deleted
   content, requires a minimum post count, and ranks by volume, then
   distinct authors, then recency. The docstring explains each decision.
3. **SQLite FTS5 to Postgres tsvector rewrite** in `server-py/app/db.py`
   (`rewrite_fts`). The frontend sends SQLite FTS5 queries because that is
   the desktop build's native dialect. Rather than maintain two search
   implementations, the server rewrites `MATCH`, `snippet()`, and
   `ORDER BY rank` into `websearch_to_tsquery`, `ts_headline`, and
   `ts_rank` against generated tsvector columns.

## Design decisions

- Private user data (highlights, notes) is scoped by `WHERE user_id = $n`
  on every query. Group content is shared, so access depends on holding a
  `group_membership` row, checked by `get_role()` before anything else.
  Non-members get a 404 rather than a 403 so the API does not reveal
  whether a private group exists.
- We use Supabase Auth instead of rolling our own. The server verifies the
  Supabase JWT (ES256 via JWKS) and uses the `sub` claim as the user id,
  so our code never handles passwords. We also enabled Postgres row level
  security with a deny-all policy on every table, so the Supabase REST API
  cannot read our tables even with the public anon key.
- The live feed polls every 5 seconds instead of using websockets.
  Payloads are small, the server is one stateless FastAPI process, and
  React Query pauses polling in unfocused tabs. Websockets would mean
  managing connection state for a feed that updates a few times an hour.
- Display names are joined at read time instead of being copied onto each
  post. A rename applies to every existing post immediately. A copied
  `author_name` would go stale the first time someone renamed themselves.

## Where agents helped most and where we pushed back

Claude was best when just writing the backend code. He could one-shot most
code requested. His biggest weakness is that he sometimes tries to override
tests, and (as one would expect) has difficulty fixing UI and UX problems.
At one point there was a problem because the CI was red, and Claude wanted
to patch Jack's conftest, so I had to rein it in a little. I had it leave
Jack a comment with the diagnosis instead, and Jack shipped his own fix the
next day. There was also a
lot of difficulty getting it to resolve some UI problems on the phone, such
as making the buttons possible to click.

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

Run the frontend tests with `npm test` (vitest, 185 tests) and the backend
tests with `DATABASE_URL=... python3 -m pytest server-py -q` (about 100
across unit, integration, and acceptance). CI runs both on every push and
PR against a Postgres service container, and the deploy waits for green.

## Gold

- For the pick-one requirement we chose real-time-ish updates. Open feeds
  and threads poll every 5 seconds. The polling design decision above
  explains why polling fits this app better than push.
- Custom features
  - **Scripture autolink.** Verse references typed in post bodies become
    links into the reader.
  - **Discuss from reader.** A verse's toolbar jumps into the group feed
    anchored to that verse, and back.
  - **Invite code rotation.** Moderators can replace the invite code if it
    gets shared too widely. The old code stops working immediately and
    existing members keep their access.
  - **Unflag.** A flagger can withdraw a standing flag. The post returns
    to visible only when the last flag is withdrawn and no moderator has
    acted.
- Phone support. Translations stack per verse below 520px, controls are
  44px, text inputs are 16px so iOS Safari does not zoom on focus. We
  audited every screen on a real phone.

## About the app itself

Corpus sources, licensing policy, and the desktop (Tauri) build are
documented in [docs/ABOUT.md](docs/ABOUT.md).
