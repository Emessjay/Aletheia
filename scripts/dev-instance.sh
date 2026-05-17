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
