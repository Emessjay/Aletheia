#!/usr/bin/env bash
# Launch `tauri dev` with per-instance Vite port and Tauri bundle identifier so
# multiple worktrees can run in parallel. See the "Worktree-per-feature" section
# in CLAUDE.md for context.
#
# Usage:
#   ./scripts/dev-instance.sh         # auto-pick lowest free instance index
#   ./scripts/dev-instance.sh 2       # pin to instance #2
#
# Instance N → Vite port 1420 + 2N, HMR port + 1, identifier *.devN.

set -euo pipefail

port_for() { echo $((1420 + $1 * 2)); }

is_port_free() {
    ! lsof -iTCP:"$1" -sTCP:LISTEN -P -n >/dev/null 2>&1
}

if [[ -n "${1:-}" ]]; then
    N="$1"
    if ! [[ "$N" =~ ^[1-9][0-9]*$ ]]; then
        echo "error: instance index must be a positive integer, got: $N" >&2
        exit 1
    fi
else
    N=1
    while ! is_port_free "$(port_for "$N")"; do
        N=$((N + 1))
        if (( N > 32 )); then
            echo "error: no free instance slot 1..32" >&2
            exit 1
        fi
    done
fi

PORT="$(port_for "$N")"
HMR=$((PORT + 1))
IDENT="org.jackporter.aletheia.dev${N}"

# Linked git worktrees have `.git` as a file (a gitdir pointer); the main
# checkout has it as a directory. When booted from a linked worktree, expose
# its slug to the frontend so AppShell can render a label in the top-right —
# useful when several dev instances are running side-by-side. The slug is the
# cwd basename with the `aletheia-` prefix stripped (matches new-worktree.sh).
WORKTREE_LABEL=""
if [[ -f .git ]]; then
    dir_name="$(basename "$PWD")"
    WORKTREE_LABEL="${dir_name#aletheia-}"
fi

echo "▶ Aletheia dev #${N}  vite=${PORT}  hmr=${HMR}  identifier=${IDENT}${WORKTREE_LABEL:+  worktree=${WORKTREE_LABEL}}"

# Corpus packs: fetch development channel when missing.
if [[ ! -f data/packs/base.sqlite ]]; then
    if [[ -f data/Aletheia.sqlite ]]; then
        echo "▶ Generating corpus packs from data/Aletheia.sqlite…"
        python3 scripts/split-corpus-packs.py
    elif python3 -c "import json; m=json.load(open('data/packs/hub-manifest.dev.json')); exit(0 if m.get('revision') else 1)" 2>/dev/null; then
        echo "▶ Fetching development corpus packs from Hugging Face Hub…"
        python3 -m pip install -q -r scripts/requirements-corpus.txt
        python3 scripts/fetch-corpus-packs.py --channel development
    else
        echo "warning: no data/packs/base.sqlite — run npm run fetch-corpus-packs -- --channel development" >&2
    fi
fi

# Audio pack MP3s are gitignored (large). Offline narration needs a one-time fetch.
mp3_count="$(find data/packs/audio-modern-en -name '*.mp3' -type f 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${mp3_count}" -eq 0 ]]; then
    echo "warning: audio-modern-en has no MP3s — run: npm run fetch-audio-pack" >&2
    echo "         (until then, Tauri still downloads chapters on demand)" >&2
fi

export ALETHEIA_PORT="$PORT"
export ALETHEIA_HMR_PORT="$HMR"
export VITE_ALETHEIA_WORKTREE="$WORKTREE_LABEL"

# Patch tauri.conf.json at runtime: --config takes a JSON file path.
TMP_CFG="$(mktemp -t aletheia-dev-cfg.XXXXXX).json"
trap 'rm -f "$TMP_CFG"' EXIT
cat > "$TMP_CFG" <<EOF
{
  "identifier": "${IDENT}",
  "build": { "devUrl": "http://localhost:${PORT}" }
}
EOF

exec npm run tauri dev -- --config "$TMP_CFG"
