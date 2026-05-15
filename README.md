# Aletheia

Bible reading + annotation app for macOS and iOS. Toggle between the Hebrew Masoretic
Text, Greek Septuagint, Greek NT (Nestle 1904 or Byzantine), and English (BSB, KJV,
Brenton). Strong's lookups via BDB + Thayer's. Highlight verses, bookmark them into
themed libraries, sync via iCloud. Ships with parallel English / Greek / Latin readers
for the *Summa Theologica*, the *Dialogue with Trypho*, and *On the Incarnation*.

## Project layout

```
.
├── Aletheia/                  # Shared SwiftUI sources (both targets)
├── AletheiaMac/               # macOS app entry + entitlements + Info.plist
├── AletheiaiOS/               # iOS app entry + entitlements + Info.plist
├── AletheiaTests/             # XCTest target
├── data/
│   ├── sources/               # Raw upstream data (gitignored; populated by fetch_sources.sh)
│   └── Aletheia.sqlite        # Built corpus, bundled with the app
├── scripts/
│   └── fetch_sources.sh       # One-shot fetch of every raw source
├── tools/
│   └── ingest/                # SPM package: parsers + CLI that builds Aletheia.sqlite
├── project.yml                # xcodegen spec — regenerate Aletheia.xcodeproj from this
└── Aletheia.xcodeproj         # Generated; do not edit by hand
```

## Build & run

Requires Xcode 17+, Swift 5.10+, and [xcodegen](https://github.com/yonaskolb/XcodeGen):

```sh
brew install xcodegen
```

### One-time setup — build the corpus

```sh
./scripts/fetch_sources.sh                  # Pull every raw text into data/sources/
cd tools/ingest
swift run aletheia-ingest \
    --source-root ../../data/sources \
    --output ../../data/Aletheia.sqlite
```

The corpus is read-only at runtime and is bundled with the app as a resource. Rebuild
it whenever upstream data or the schema changes; users get the new copy with the next
app release.

### Generate the Xcode project and run

```sh
xcodegen generate
open Aletheia.xcodeproj
```

Run the `AletheiaMac` scheme to launch the desktop app; `AletheiaiOS` for iPhone/iPad.

### Tests

```sh
cd tools/ingest && swift test         # Parser unit tests
xcodebuild -project Aletheia.xcodeproj -scheme AletheiaTests test
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

Patristic sources (CCEL ThML, OpenGreekAndLatin First1KGreek, Corpus Thomisticum)
are under review — see [CLAUDE.md](CLAUDE.md). They are not biblical content and
their licensing is being resolved separately.

Sources we explicitly avoid: SBLGNT, Tyndale House GNT, NA28, BHS, Rahlfs-Hanhart,
Göttingen LXX, CCAT/CATSS LXX, and any CC BY-NC / CC BY-SA / GPL biblical data.
The goal is zero-strings reuse: anyone should be able to lift the corpus from
`Aletheia.sqlite` and redistribute with no attribution or licensing obligations.

## Sync

User data (highlights, bookmarks, libraries, notes) lives in a SwiftData store
configured with `cloudKitDatabase: .private("iCloud.org.jackporter.aletheia")`.
Sync between Mac and iPhone happens automatically when the user is signed into
iCloud on both devices. There is no backend.
