# Corpus packs (desktop / Tauri)

Optional content shards for the local Aletheia app. Generated from the
monolithic `data/Aletheia.sqlite` — do not commit the `.sqlite` files.

## Generate

```sh
python3 scripts/split-corpus-packs.py
# or: npm run pack-corpus
```

Requires the monolith at `data/Aletheia.sqlite` (gitignored; copy from the
main checkout or rebuild via the ingest pipeline).

## Artifacts

| Pack | File |
|------|------|
| base | `base.sqlite` |
| Interlinear | `interlinear.sqlite` |
| Commentaries | `commentaries.sqlite` |
| Ante-Nicene Fathers | `anf.sqlite` |
| Nicene and Post-Nicene Fathers | `npnf.sqlite` |
| Reformers | `reformers.sqlite` |
| Audio (Modern English) | `audio-modern-en/` (manifest + timing; MP3s on demand) |

## Dev vs production

- **Dev / test** (`./scripts/dev-instance.sh`): `tauri.conf.json` lists every
  pack under `bundle.resources`. Cold start merges installed packs into the
  working corpus under app data.
- **Production installer**: ship only `base.sqlite` in resources (trim the
  resources array). Optional packs download later into
  `<app_data>/packs/` via `corpus_pack_install_from_path` (CDN TBD).

Web builds ignore these packs — they trim via Postgres ingest instead.
