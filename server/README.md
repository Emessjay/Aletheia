# Aletheia server

The Node API + static-site host that backs the web/Railway build of Aletheia.

The desktop app talks to its host environment (filesystem, SQLite, app-data
directory) through the platform adapter in `src/platform/`. The browser build
satisfies the same adapter shape by calling the JSON endpoints exposed here.
The frontend code that consumes these endpoints will land in Wave 3b under
`src/platform/web/`; this package is intentionally standalone so it can be
deployed without dragging the Tauri runtime into the image.

## Scope and non-goals

This server is **read-only with respect to user data**. The browser build
will store annotations in IndexedDB, so there is no auth, no session state,
and no write endpoints. The corpus database is opened read-only and contains
only public-domain biblical text. The arbitrary-SQL surface on
`/api/corpus/*` is intentional — see the security note below.

## Endpoints

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Railway healthcheck. Returns `{ ok: true, corpus: "loaded" }`. |
| `POST /api/corpus/select` | Body `{ sql, params }` → `{ rows: T[] }`. |
| `POST /api/corpus/selectOne` | Body `{ sql, params }` → `{ row: T \| null }`. |
| `GET /api/audio/source-path` | Query `?translation=&book=&file=` → `{ url, exists }`. |
| `GET /api/audio/book-sources` | Query `?translation=&book=` → `string[]` of cached filenames. |
| `POST /api/audio/download` | Body `{ translation, book, url, filename }` — fetches upstream MP3 into the cache, returns `{ url }`. |
| `GET /api/audio/stream/:translation/:book/:file` | Range-supporting MP3 stream from the cache. |

Anything else falls through to `dist/index.html` so React Router's
client-side routes work on direct URL hits.

## Security trade-offs

The corpus endpoints accept arbitrary SQL strings from the client. This is
safe because:

1. The SQLite handle is opened with `readonly: true` — any
   `INSERT`/`UPDATE`/`DELETE`/`DROP` will throw before touching disk.
2. The corpus contains only public-domain text (Berean Standard Bible,
   KJV, World English Bible, Brenton LXX, byztxt, Strong's, etc.). There
   is no PII or auth material in the file.
3. Result sets are capped: 50 000 rows or 5 MiB of serialized JSON, whichever
   hits first. This protects against a runaway `SELECT *` from a verses
   table OOM'ing the dyno.
4. SQL containing `;` is rejected to forbid multi-statement injection.
   (better-sqlite3's `.prepare()` already compiles only the first statement,
   so this is belt-and-braces, but it produces a clearer error.)

If the threat model ever changes — e.g. user-generated content lands in the
corpus DB — this surface should be replaced with a curated set of typed
endpoints. For the public-domain biblical text the desktop app already
ships, the trade-off favours mirroring the Tauri adapter exactly so the
frontend code stays identical.

## Audio cache

Audio MP3s are fetched lazily into `${ALETHEIA_AUDIO_CACHE:-/tmp/aletheia-audio}`
on first request. On Railway this defaults to `/tmp`, which is ephemeral —
every redeploy wipes the cache. That is acceptable because the cache rebuilds
on demand from upstream public-domain sources (openbible.com, ebible.org,
LibriVox). If you want persistent cache across deploys, mount a Railway
volume and point `ALETHEIA_AUDIO_CACHE` at it.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port. |
| `ALETHEIA_CORPUS_PATH` | `../data/Aletheia.sqlite` (local) / `/app/data/Aletheia.sqlite` (Docker) | Path to the bundled corpus SQLite file. |
| `ALETHEIA_AUDIO_CACHE` | `/tmp/aletheia-audio` | Where downloaded MP3s are cached. |
| `ALETHEIA_STATIC_DIR` | `../dist` (local) / `/app/public` (Docker) | Built frontend bundle to serve. |

## Running locally

```sh
# From the repo root, build the frontend once:
npm install
npm run build

# Then in another shell:
cd server
npm install
npm run build
node dist/index.js
```

The server prints the corpus path, audio cache path, and static dir on
boot, then listens on `:3000`. Hit `http://localhost:3000/api/health` to
verify the corpus loaded.

## Deploying on Railway

The repo-root `railway.toml` points Railway at `server/Dockerfile`. Push the
branch and Railway will:

1. build the frontend bundle (Stage 1 of the Dockerfile),
2. compile this server (Stage 2),
3. assemble a slim runtime image with the corpus copied in (Stage 3),
4. health-check `/api/health` and start serving on `$PORT`.

The build context must be the repo root, not `server/`, because Stage 1
needs the root `package.json`, `vite.config.ts`, and `src/`. The
`.dockerignore` in this directory keeps the upload small.

## Debugging

- **Boot fails with `unable to open database file`** — the path in
  `ALETHEIA_CORPUS_PATH` doesn't exist or isn't readable. The corpus is a
  build artifact of `tools/ingest`; for local dev, make sure
  `data/Aletheia.sqlite` is present, or run the ingest pipeline.
- **`/api/corpus/select` returns `sql must not contain ';'`** — the
  frontend tried to send a multi-statement query. Split it into separate
  requests, or wrap in a single `WITH … SELECT …` if you need atomicity.
- **`/api/corpus/select` returns `result exceeds 50000-row cap`** — your
  query is too broad. Add a `LIMIT` clause or filter by book/chapter.
- **Range requests behave oddly in Safari** — Safari aggressively reuses
  cached partial responses; clear the cache or test in an incognito window.
- **`docker build` says `better-sqlite3` failed to compile** — the Stage 2
  image needs `python3 make g++` to build the native addon. The Dockerfile
  installs these; if you've customized the base image, you'll need to
  install them too.

## Relation to the desktop build

The Rust commands under `src-tauri/src/audio.rs` and the
`tauri-plugin-sql` adapter are the source of truth for the slug/filename
validation rules and the SQL surface. If those change, this server must
change too — there is no codegen between the two, by intent. The
translation list lives in `src/domain/translations.ts`; the allowed audio
translations are duplicated here as a hardcoded set (`en_bsb`, `en_kjv`,
`en_web`), matching the same hardcoded set in `audio.rs`.
