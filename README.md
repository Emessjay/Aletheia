# Aletheia

A polyglot Bible study app with a bundled, license-clean corpus.

Read the Hebrew Masoretic Text, the Greek Septuagint and Byzantine New
Testament, and three English translations side by side. Look up every Hebrew
and Greek word against Strong's, follow Treasury of Scripture Knowledge
cross-references, read patristic commentary, and listen to public-domain
audio narration — all offline, against a SQLite corpus shipped inside the
app.

## Screenshots

Screenshots will follow.

- `docs/screenshots/reader.png` — primary reader view
- `docs/screenshots/lexicon.png` — Strong's lookup
- `docs/screenshots/patristics.png` — patristic commentary alongside the text
- `docs/screenshots/design.png` — theme editor

## Features

- Parallel reader for BSB, KJV (with Apocrypha), Brenton English LXX,
  Brenton Greek LXX, WLC Hebrew, and the Robinson-Pierpont Byzantine Greek
  New Testament.
- Commentary view with the Schaff ANF/NPNF patristic editions and the
  *Summa Theologica* (Latin + English).
- Strong's lookups on the English side, backed by the unabridged BDB
  Hebrew lexicon and Strong's Greek dictionary.
- Cross-references from the Treasury of Scripture Knowledge.
- Audio narration for English translations (Bob Souer BSB, Michael Paul
  Johnson WEB, LibriVox KJV solos), streamed on first play and cached
  locally.
- Highlights, bookmarks into themed libraries, and per-verse notes — all
  stored locally with ULID keys and tombstones so a sync layer can drop in
  later.
- Themeable: every color is a CSS custom property and there is a built-in
  visual theme editor.
- Offline-first. The bundled corpus is the source of truth; nothing
  required at runtime calls the network.

## Quickstart

Requires Node 20+, the Rust toolchain, and (for iOS builds) Xcode 17+.
Pre-built binaries will be published once releases stabilize; for now,
build from source.

**Build the corpus once:**

```sh
./scripts/fetch_sources.sh
cd tools/ingest
swift run aletheia-ingest \
    --source-root ../../data/sources \
    --output ../../data/Aletheia.sqlite
```

**Run the desktop app:**

```sh
npm install
./scripts/dev-instance.sh
```

`./scripts/dev-instance.sh` is the canonical launcher — it picks an unused
Vite port and Tauri instance ID so multiple dev windows can run in parallel
without colliding. Do not invoke `npm run tauri dev` directly.

**Production build (macOS):**

```sh
npm run tauri build
```

On Linux and Windows the same `npm run tauri build` command produces a
native bundle in `src-tauri/target/release/bundle/`.

## Architecture

**Desktop app.** A React + TypeScript + Vite frontend wrapped by Tauri 2.
The Tauri shell exposes a `corpus_db_path` command and copies the bundled
SQLite corpus into the platform's app-data directory on first launch so
SQLite can open it with proper WAL semantics. User data (highlights,
bookmarks, notes) lives in a separate local SQLite (`aletheia_user.db`)
with ULID keys and soft-delete tombstones.

**Ingest pipeline.** A Swift Package under [tools/ingest/](tools/ingest/)
ingests every raw upstream source (BSB plain text, eBible.org USFM, byztxt,
BDB, Strong's, Treasury of Scripture Knowledge, Jacob-Gray *Summa*, and
the Schaff patristics) into the single bundled `data/Aletheia.sqlite`. The
corpus is read-only at runtime and rebuilt offline whenever sources or
schema change.

**Web / Railway deployment.** A hosted variant is on the roadmap — the
goal is to make the same reader available in a browser without the desktop
install step. The corpus and React frontend are unchanged; only the Tauri
shell is replaced with a thin server.

## Corpus licensing

Everything in `data/Aletheia.sqlite` is public domain or under a no-strings
permissive license. ShareAlike, NonCommercial, and copyrighted critical
editions (SBLGNT, NA28, BHS, Rahlfs-Hanhart, Göttingen, CCAT/CATSS) are
explicitly out of scope. The full policy and the list of vetted vs.
rejected sources lives in [CLAUDE.md](CLAUDE.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the worktree convention, how to
run the tests, what we'll accept into the corpus, and how to add a new
translation or top-level tab. By participating you agree to the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

Aletheia is released into the public domain under the
[CC0 1.0 Universal](LICENSE) dedication — no attribution required, no
strings attached. The bundled corpus is also public domain; see the
licensing section above.
