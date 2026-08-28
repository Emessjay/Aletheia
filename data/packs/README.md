# Corpus packs (desktop / Tauri)

Optional content shards for the local Aletheia app. Artifacts live on
[Hugging Face Hub](https://huggingface.co/datasets/Emessjay/aletheia-corpus)
in two channels:

| Channel | Manifest | HF branch | Used by |
|---------|----------|-----------|---------|
| **Production** | `hub-manifest.json` | `production` (legacy uploads on `main`) | Stable downloads, homepage Mac build, web Postgres ingest bootstrap |
| **Development** | `hub-manifest.dev.json` | `development` | `./scripts/dev-instance.sh`, selective `reingest`, maintainer uploads |

Do not commit `.sqlite` files or audio MP3s — only the pinned manifests.

## Fetch prebuilt packs

```sh
pip install -r scripts/requirements-corpus.txt

# Stable / release builds:
npm run fetch-corpus-packs -- --channel production

# In-development worktrees:
npm run fetch-corpus-packs -- --channel development

# Selected packs only:
npm run fetch-corpus-packs -- --channel production --packs base interlinear
```

Public datasets need **no HF token** for fetch. Downloads verify SHA-256 against
the manifest.

Bootstrap monolith + packs when `data/Aletheia.sqlite` is missing:

```sh
npm run ensure-corpus-from-hub -- --channel development
```

## Hugging Face tokens

| Token | Use |
|-------|-----|
| **Write** | `upload-corpus-packs`, `promote-corpus-packs`, `create-hf-dataset` — `export HF_TOKEN=hf_...` locally only |
| **Read** | Optional spare for private datasets or rate limits — still never commit |

Unset `HF_TOKEN` when done (`unset HF_TOKEN`).

## Maintainer workflow

**Mutate development corpus** (after local Swift ingest / pack split):

```sh
npm run reingest -- commentaries          # bootstraps monolith from HF dev if missing
export HF_TOKEN=hf_...
npm run upload-corpus-packs               # → development branch + hub-manifest.dev.json
git add data/packs/hub-manifest.dev.json && git commit -m "Update development corpus …"
```

**Promote to production** (each major Aletheia release):

```sh
export HF_TOKEN=hf_...
npm run promote-corpus-packs
git add data/packs/hub-manifest.json && git commit -m "Promote corpus for Aletheia X.Y"
```

`promote-corpus-packs` copies the pinned development revision onto the
`production` HF branch and rewrites `hub-manifest.json`.

Full local rebuild from sources (rare — only when upstream PD sources change):

```sh
./scripts/fetch_sources.sh
npm run reingest:all
npm run fetch-audio-pack          # optional; ~8 GiB
npm run upload-corpus-packs
```

## Generate / reingest

Selective reingest bootstraps `data/Aletheia.sqlite` from the **development**
channel when the monolith is missing, then runs scoped Swift ingest against
`data/sources/` and re-splits affected packs.

```sh
./scripts/reingest-packs.sh --help
npm run reingest -- commentaries interlinear
npm run reingest:all              # full source rebuild (needs fetch_sources.sh)
```

Web Postgres ingest (`python -m app.scripts.ingest_corpus`) bootstraps the
monolith from the **production** channel when `data/Aletheia.sqlite` is absent.

## Test

```sh
python3 scripts/test_corpus_hub.py           # checksum unit tests
npm run test:corpus-hub                      # HF fetch base pack + merge smoke test
CORPUS_HUB_TEST_PACKS=all npm run test:corpus-hub   # full download (slow)
```

## Artifacts

| Pack | File |
|------|------|
| base | `base.sqlite` |
| Interlinear | `interlinear.sqlite` |
| Commentaries | `commentaries.sqlite` |
| Ante-Nicene Fathers | `anf.sqlite` |
| Nicene and Post-Nicene Fathers | `npnf.sqlite` |
| Reformers | `reformers.sqlite` |
| Audio (Modern English) | `audio-modern-en/` |

Web builds ignore desktop packs — they trim via Postgres ingest instead.
