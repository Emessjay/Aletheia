# Corpus packs (desktop / Tauri)

Optional content shards for the local Aletheia app. Generated from the
monolithic `data/Aletheia.sqlite` — do not commit the `.sqlite` files or
audio MP3s.

## Generate / reingest

**Split only** (monolith already up to date):

```sh
python3 scripts/split-corpus-packs.py
# or: npm run pack-corpus

# One or more packs only (merges into data/packs/registry.json):
python3 scripts/split-corpus-packs.py --packs commentaries anf
```

**Reingest** (Swift ingest + pack split):

```sh
# Help (also the default when you pass no args):
./scripts/reingest-packs.sh --help
# or: npm run reingest

# Full rebuild — wipe/rebuild data/Aletheia.sqlite, then split every pack:
./scripts/reingest-packs.sh --all
# or: npm run reingest:all

# Selective — merge scoped ingest groups into the existing monolith, then
# rewrite only the named shards:
./scripts/reingest-packs.sh commentaries interlinear
npm run reingest -- anf npnf reformers

# Audio only — no SQLite ingest; downloads MP3s + refreshes the pack manifest:
./scripts/reingest-packs.sh audio-modern-en
# or: npm run fetch-audio-pack

# Split-only after you already ran aletheia-ingest yourself:
./scripts/reingest-packs.sh --pack-only commentaries
```

Requires the monolith at `data/Aletheia.sqlite` for any SQLite pack (gitignored;
copy from the main checkout or rebuild via `--all` / the ingest pipeline).
`audio-modern-en` alone does not need the monolith.

`fetch-audio-pack.py` is resumable and mirrors `src/domain/audio.ts` URLs
(BSB + WEB deuterocanon under `en_bsb/`, KJV from `kjv-timing.json` under
`en_kjv/`). Sources are public domain (openbible.com, ebible.org, LibriVox /
Archive.org). Full `--all` does **not** fetch MP3s.

### Pack → ingest group → artifact

| Pack | `aletheia-ingest --groups` | Output |
|------|----------------------------|--------|
| `base` | `bible,summa,creeds` (heavy) | `base.sqlite` |
| `interlinear` | `bible` (heavy; word table) | `interlinear.sqlite` |
| `commentaries` | `commentary` | `commentaries.sqlite` |
| `anf` | `anf` | `anf.sqlite` |
| `npnf` | `npnf` | `npnf.sqlite` |
| `reformers` | `reformers` | `reformers.sqlite` |
| `audio-modern-en` | *(none — fetch-audio-pack)* | `audio-modern-en/` |

Selective ingest uses Pipeline **merge mode** (filters keep the existing
`Aletheia.sqlite` and re-write matching stages). Split always reads the
monolith and emits only the packs you name.

**Caveats**

- **`base` / `interlinear` are heavy** — both pull the bible group (all
  Bible/STEPBible/lexicon/xref stages). Prefer them only when those slices
  changed; otherwise re-split with `--pack-only`.
- **Base still needs the monolith** as the split source (emit_base copies
  then strips optional works/`word`). There is no base-only SQLite without
  a full corpus file.
- **Runtime merge fingerprint** — after rewriting packs under `data/packs/`,
  the next Tauri launch re-copies/merges into app-data when source
  fingerprints change (see `src-tauri/src/corpus_packs.rs`).
- Multiple named packs union their ingest groups into one Swift run, then
  split each requested shard.

## Artifacts

| Pack | File |
|------|------|
| base | `base.sqlite` |
| Interlinear | `interlinear.sqlite` |
| Commentaries | `commentaries.sqlite` |
| Ante-Nicene Fathers | `anf.sqlite` |
| Nicene and Post-Nicene Fathers | `npnf.sqlite` |
| Reformers | `reformers.sqlite` |
| Audio (Modern English) | `audio-modern-en/` (manifest + timing + MP3s) |

Typical sizes after a full `fetch-audio-pack` run are recorded in
`registry.json` (`bytes` field). Without MP3s the audio pack is only
timing/manifest (~90 KiB).

## Dev vs production

- **Dev / test** (`./scripts/dev-instance.sh`): `tauri.conf.json` lists every
  pack under `bundle.resources`. Cold start merges installed SQLite packs into
  the working corpus under app data. Audio MP3s are read from the pack and
  hard-linked into `$APPDATA/audio/` for the asset protocol — no network when
  present.
- **Production installer**: ship only `base.sqlite` in resources (trim the
  resources array). Optional packs download later into
  `<app_data>/packs/` via `corpus_pack_install_from_path` (CDN TBD), including
  a full `audio-modern-en/` directory when you want offline narration.

Web builds ignore these packs — they trim via Postgres ingest instead and
keep on-demand `/api/audio` caching.
