# Aletheia — Claude project notes

## Worktree-per-feature

Before starting work on any non-trivial feature, create a git worktree for it
and do all editing + testing inside that worktree.

Use the helper script — it creates the worktree on `feature/<slug>` and runs
`npm install` so the new checkout is ready to build:

    ./scripts/new-worktree.sh <slug>

When the feature is complete, commit the work *inside the worktree* before
handing off — do not leave uncommitted changes for the user to merge, since a
`git merge` of an unchanged branch is a no-op. Then give the user a single
combined command they can paste from the main worktree to merge and clean up:

    git merge feature/<slug> && git worktree remove ../aletheia-<slug> && git branch -d feature/<slug>

The primary reason is isolation between concurrent Claude instances: working in
a shared checkout means one instance can read another's partially-written code
mid-edit, leading to confused state and conflicting changes. A worktree gives
each instance its own filesystem view and its own branch. The secondary reason
applies only when running the Tauri app: parallel `tauri dev` instances
otherwise collide on the Vite port, the Tauri single-instance lock, and the
macOS app-data directory. **Never run `npm run tauri dev` directly** inside a
worktree — always launch via:

    ./scripts/dev-instance.sh        # auto-picks the lowest free instance index
    ./scripts/dev-instance.sh 3      # or pin to instance #3 explicitly

The script overrides the Tauri bundle identifier to `org.jackporter.aletheia.devN`
and picks Vite port `1420 + 2N`, so each instance has an isolated user-data
SQLite under `~/Library/Application Support/`. Without this, the
`tauri_plugin_single_instance` lock in [src-tauri/src/lib.rs](src-tauri/src/lib.rs)
will refuse to launch a second window.

### Merge conflicts

If a merge from `main` into your feature branch produces a conflict, do **not**
assume `main` looks the way it did when you branched — other Claude instances
may have landed features in parallel. Read both sides of every conflict hunk
carefully and preserve the new work on `main` alongside your own changes.
Resolving a conflict by discarding the incoming side is almost never correct;
when in doubt, inspect the `main`-side commit (`git log -p` on the conflicting
file) to understand what feature it was implementing before deciding how to
combine.

## Corpus licensing policy

When sourcing new content for the bundled corpus (`data/Aletheia.sqlite`), prefer
**CC0 / public domain / Unlicense** sources. The goal is for anyone to be able to
extract and reuse the corpus with zero attribution or licensing strings.

Ranked preference:

1. **Public domain by age** (pre-1929 works, ancient texts) — ideal.
2. **CC0 / Unlicense / explicit PD dedication** — ideal.
3. **CC BY** — acceptable only when no PD equivalent exists; requires a credit-screen
   entry and a note in [README.md](README.md).
4. **CC BY-SA, CC BY-NC, GPL** — avoid. ShareAlike is viral and NC blocks reuse;
   either disqualifies the corpus from the "no strings" goal.
5. **"All rights reserved" / unlicensed digital editions** — never bundle. Re-source
   from a scan, a PD transcription, or drop the content.

When evaluating a candidate, verify the *digital edition's* license, not just the
underlying work — a PD-by-age text can still ship under CC BY if the transcriber
asserts rights over the markup.

### Strong's coverage is optional on non-English sides

A tagged Hebrew OT (Strong's + morphology) with a true PD license does not appear
to exist — every option (OSHB/morphhb, Westminster Hebrew Morphology, etc.) is at
least CC BY. If forced to choose, **ship Strong's lookups only on the English
side** rather than pulling in a CC BY tagged Hebrew or Greek text. Untagged PD
Hebrew (e.g. tanach.us WLC) and untagged PD Greek (e.g. eBible.org `grcbrent` for
LXX, byztxt for the Byzantine NT — which *is* PD-tagged) are preferable to a
tagged-but-encumbered alternative.

### Sources already vetted PD

- BSB (post-2023 PD dedication), Brenton English LXX, KJV + Apocrypha
- eBible.org `grcbrent` (Brenton Greek LXX)
- byztxt/byzantine-majority-text (Robinson-Pierpont, PD with Strong's + morphology)
- Jacob-Gray/summa.json (Unlicense)
- Treasury of Scripture Knowledge (1880s, PD)
- eliranwong/unabridged-BDB-Hebrew-lexicon (underlying BDB PD)

### Sources to avoid or replace

- **First1KGreek** — CC BY-SA 4.0. Viral. Currently used for Greek patristics;
  do not extend to biblical content.
- **Corpus Thomisticum** — "iura omnia asservantur." Not redistributable. The
  README's "non-commercial w/ attribution" line understates the restriction.
- **CCAT / CATSS LXX** — user-declaration requirement; treat as non-PD.
- **SBLGNT, Tyndale House GNT, BHS, Rahlfs-Hanhart, Göttingen LXX** — copyrighted.
