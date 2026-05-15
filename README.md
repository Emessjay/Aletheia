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

Every source bundled into `Aletheia.sqlite` is either public domain or under a
permissive license. The attribution screen in the app credits each upstream project
as the licenses require.

| Source | License |
|---|---|
| STEPBible TAGOT / TAHOT / TAGNT / TKJVS | CC BY 4.0 |
| OpenScriptures HebrewLexicon (BDB + Strong's H) | CC BY 4.0 |
| OpenScriptures Strongs (Greek) | Public Domain / CC BY 4.0 |
| BSB plain text + interlinear | Public Domain |
| Brenton LXX English | Public Domain |
| KJV 1611 Apocrypha | Public Domain |
| OpenBible.info cross-references | CC BY |
| Jacob-Gray/summa.json | Unlicense (PD) |
| Corpus Thomisticum Latin dump | Underlying Leonine text PD; non-commercial w/ attribution |
| CCEL ThML (Trypho, On the Incarnation) | Public Domain |
| OpenGreekAndLatin First1KGreek TEI | CC BY-SA 4.0 |

Sources we explicitly avoid (license incompatible with a paid iOS app): SBLGNT,
Tyndale House GNT, Sources Chrétiennes, CCAT/CATSS LXX.

## Sync

User data (highlights, bookmarks, libraries, notes) lives in a SwiftData store
configured with `cloudKitDatabase: .private("iCloud.org.jackporter.aletheia")`.
Sync between Mac and iPhone happens automatically when the user is signed into
iCloud on both devices. There is no backend.
