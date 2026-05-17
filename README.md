# Aletheia

Bible reading + annotation app for macOS and iOS. Toggle between the Hebrew
Masoretic Text, the Greek Septuagint and NT (Byzantine), and English (BSB, KJV,
Brenton). Strong's lookups via BDB and Strong's Greek dictionary. Highlight
verses, bookmark them into themed libraries, leave notes per verse, and jump
between cross-references. Ships with parallel English / Greek / Latin readers
for the *Summa Theologica*, the *Dialogue with Trypho*, and *On the
Incarnation*.

Built with React + Vite + Tauri 2 over a read-only bundled SQLite corpus.

## Project layout

```
.
├── src/                        # React + TypeScript app
│   ├── db/                     # SQLite handles + queries + hooks
│   ├── domain/                 # Reference parser, translation metadata
│   ├── features/               # reader, search, commandPalette, libraries,
│   │                             lexicon, patristics, design
│   ├── components/             # Shared UI primitives + ErrorBoundary
│   ├── stores/                 # Zustand stores (settings, palette)
│   └── styles/                 # index.css + design tokens + fonts (self-hosted)
├── src-tauri/                  # Tauri 2 Rust shell
│   ├── src/lib.rs              # corpus_db_path command + plugin-sql migrations
│   ├── capabilities/           # Allowed plugin permissions
│   ├── icons/                  # App icons (placeholder, replace before ship)
│   └── gen/apple/              # iOS Xcode project (gitignored; regenerate with tauri ios init)
├── data/
│   ├── sources/                # Raw upstream data (gitignored; populated by fetch_sources.sh)
│   └── Aletheia.sqlite         # Built corpus, bundled with the app
├── scripts/
│   └── fetch_sources.sh        # One-shot fetch of every raw source
├── tools/
│   └── ingest/                 # SPM package: parsers + CLI that builds Aletheia.sqlite
├── index.html, vite.config.ts, tsconfig.json, package.json
```

## One-time setup — build the corpus

```sh
./scripts/fetch_sources.sh                  # Pull every raw text into data/sources/
cd tools/ingest
swift run aletheia-ingest \
    --source-root ../../data/sources \
    --output ../../data/Aletheia.sqlite
```

The corpus is read-only at runtime and is bundled with the app as a resource.
Rebuild it whenever upstream data or the schema changes; users get the new copy
with the next app release.

## Develop

Requires Node 20+, Rust toolchain, and (for iOS) Xcode 17+.

```sh
npm install
npm run tauri dev               # Mac desktop window with live reload
```

On first launch, the Rust side copies `data/Aletheia.sqlite` into the app's
data directory (so SQLite can open it with proper WAL semantics). Subsequent
launches reuse it; the file is re-copied only if the source mtime is newer.

In `tauri dev`, the corpus is resolved from the source tree
(`<repo>/data/Aletheia.sqlite`) when the resource bundle hasn't been built yet.
Release builds use the resource bundled into the app.

```sh
npm test                         # Vitest (unit tests)
npm run build                    # TypeScript + Vite production build
```

## Build for macOS

```sh
npm run tauri build              # Produces a notarization-ready .app and .dmg
```

Artifacts land in `src-tauri/target/release/bundle/`. Set `TAURI_SIGNING_*`
env vars (or configure `tauri.conf.json > bundle.macOS.signingIdentity`) for a
signed build.

## Build for iOS

iOS support uses Tauri 2's mobile pipeline. Required: Xcode 17+, an Apple
Developer account, and your team ID handy.

### First run — generate the Xcode project

```sh
npm run tauri ios init           # Generates src-tauri/gen/apple/
```

The generated project lives in `src-tauri/gen/apple/aletheia.xcodeproj`. It is
**gitignored** — `tauri ios init` regenerates it deterministically. Modify
`tauri.conf.json` (not the Xcode project) for app metadata changes.

### Simulator

```sh
npm run tauri ios dev            # Boots a simulator and launches the app
```

The simulator can see the dev machine's filesystem, so the source-tree corpus
fallback works without bundling.

### Real device

```sh
export APPLE_DEVELOPMENT_TEAM=XXXXXXXXXX     # Your 10-char team ID
npm run tauri ios build --debug              # Builds for arm64 device
```

You'll need to install the resulting `.ipa` via Xcode (Window → Devices and
Simulators → drag the IPA onto your device) or via TestFlight once configured.
The bundled `Aletheia.sqlite` (~131 MB) is copied into the app's container on
first launch (iOS Resources/ is read-only — SQLite can't open WAL there).

### Sharp edges

- **iCloud is gone.** The SwiftUI version synced via SwiftData + CloudKit. The
  React port stores user data locally only; the schema uses ULIDs + tombstones
  so a sync layer can drop in later without a migration. The previous SwiftUI
  app is tagged `swiftui-final` if you need to recover user data.
- **131 MB resource.** App install size is ~150 MB. Over-the-air installs need
  Wi-Fi but it's well under App Store's 4 GB limit.
- **Greek tokenization** in the bundled corpus's `word` table is sparse (only
  variant readings). Hebrew gets full per-word Strong's tagging; Greek shows
  plain prose for now. Improve via the ingest pipeline if needed.

## Customizing colors

Every color in the app is a CSS custom property declared in
[src/styles/index.css](src/styles/index.css) — semantic tokens like
`--color-bg`, `--color-fg-muted`, `--color-accent`, the six highlight pairs,
and a couple of modal scrims. Components reference these by name, never by
hex, so two views that share `--color-fg-muted` will continue to share it
after any tweak.

To edit colors interactively, open the **Design** tab in the app: pick a
theme (or duplicate a built-in to make an editable one), choose Light or
Dark, click a swatch, and pick a color. Customised tokens are marked with
a dot; **Reset** restores the stylesheet default. **Export** writes the
active theme to a `.aletheia-theme.json` file; **Import** accepts that
file (or a whole `preferences.json` payload).

Bundled reference themes live in
[src/theme/builtInThemes.ts](src/theme/builtInThemes.ts); add another to
that file and it shows up in the Design tab on next launch. The token
registry in [src/theme/tokens.ts](src/theme/tokens.ts) is the
single source of truth — a unit test enforces that every registered token
is declared in both the `:root` and `.dark` blocks of `index.css`.

User-authored themes currently persist to `localStorage`; a follow-up
will move them to a `preferences.json` file under the platform's app data
directory so they survive reinstalls and are easy to sync.

## Tests

```sh
npm test                                    # Vitest (reference parser, ULID, …)
cd tools/ingest && swift test               # Parser unit tests for the ingest CLI
```

## Data sources & licenses

All biblical sources bundled into `Aletheia.sqlite` are public domain. See
[CLAUDE.md](CLAUDE.md) for the corpus licensing policy.

| Source | License |
|---|---|
| BSB plain text | Public Domain (2023 dedication) |
| KJV 1611 + Apocrypha (eBible.org `eng-kjv`) | Public Domain (by age) |
| Brenton LXX English (eBible.org `eng-Brenton`) | Public Domain (1851) |
| Brenton LXX Greek (eBible.org `grcbrent`) | Public Domain (1851) |
| Robinson-Pierpont Byzantine Greek NT (byztxt) | Unlicense / Public Domain |
| BDB Hebrew lexicon (eliranwong/unabridged-BDB) | Public Domain (1906, by age) |
| Strong's Greek dictionary (openscriptures/strongs) | Public Domain (Strong, 1890, by age) |
| Treasury of Scripture Knowledge cross-references | Public Domain (Torrey, 1880s, by age) |
| Jacob-Gray/summa.json | Unlicense (PD) |

Audio recordings stream from the source on first play and cache to the local
app data dir under `audio/<translation>/<book>/<NNN>.mp3`:

| Source | Reader | Coverage | License |
|---|---|---|---|
| openbible.com BSB audio | Bob Souer | OT + NT | Public Domain (CC0 1.0) |
| ebible.org WEB British audio | Michael Paul Johnson | OT + NT + Deuterocanon | Public Domain |
| archive.org LibriVox KJV solos | various volunteers | partial OT (Josh, Judg, 1–2 Sam, 1–2 Kgs, 1 Chr, Prov, Lam) + most of NT and Apocrypha via virtual chapters | Public Domain |

KJV NT books, Judith, Wisdom, 1–2 Maccabees and similar LibriVox recordings
pack multiple chapters into a single MP3. We compute chapter-boundary
timestamps offline with [aeneas](https://github.com/readbeyond/aeneas)
([tools/audio/align_kjv.py](tools/audio/align_kjv.py)) and ship the timings
as [data/audio/kjv-timing.json](data/audio/kjv-timing.json) — the player then
downloads the multi-chapter source once per book and seeks into the right
segment per chapter. Books like KJV James and Jude have no LibriVox solo
recording and stay silent.

Bundled fonts:

| Font | License | Use |
|---|---|---|
| EB Garamond | OFL | Body serif (Latin script) |
| Ezra SIL | OFL | Biblical Hebrew |
| GFS Didot | OFL | Polytonic Greek |
| iA Writer Mono S | OFL | UI affordances (kbd, Strong's IDs) |

Patristic sources (CCEL ThML, OpenGreekAndLatin First1KGreek, Corpus
Thomisticum) are under review — see [CLAUDE.md](CLAUDE.md). They are not
biblical content and their licensing is being resolved separately.

Sources explicitly avoided: SBLGNT, Tyndale House GNT, NA28, BHS,
Rahlfs-Hanhart, Göttingen LXX, CCAT/CATSS LXX, and any CC BY-NC / CC BY-SA /
GPL biblical data. The goal is zero-strings reuse: anyone should be able to
lift the corpus from `Aletheia.sqlite` and redistribute with no attribution or
licensing obligations.

## Sync

User data (highlights, bookmarks, libraries, notes) lives in a local SQLite
database (`aletheia_user.db`) in the app's data directory. There is no backend
yet. The schema uses ULID primary keys, millisecond `updated_at` timestamps,
and soft-delete tombstones — a CRDT or server-mediated sync layer can drop in
later without a migration.
