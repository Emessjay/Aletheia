# Corpus packs (desktop / Tauri)

Optional content shards for the local Aletheia app. Generated from the
monolithic `data/Aletheia.sqlite` — do not commit the `.sqlite` files or
audio MP3s.

## Generate

```sh
python3 scripts/split-corpus-packs.py
# or: npm run pack-corpus

# Download Modern English narration MP3s into the audio pack (~several GiB):
python3 scripts/fetch-audio-pack.py
# or: npm run fetch-audio-pack
```

Requires the monolith at `data/Aletheia.sqlite` (gitignored; copy from the
main checkout or rebuild via the ingest pipeline).

`fetch-audio-pack.py` is resumable and mirrors `src/domain/audio.ts` URLs
(BSB + WEB deuterocanon under `en_bsb/`, KJV from `kjv-timing.json` under
`en_kjv/`). Sources are public domain (openbible.com, ebible.org, LibriVox /
Archive.org).

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
