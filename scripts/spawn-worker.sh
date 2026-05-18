#!/usr/bin/env bash
# Spawn a worker Claude in a new git worktree.
#
# Usage:
#   ./scripts/spawn-worker.sh <slug> "<task description>"
#
# Run by the auditor. Refuses if 5 workers are already active
# (states `running` or `blocked`).
#
# Creates ../aletheia-<slug>/ (via scripts/new-worktree.sh) if it does
# not exist, writes state files under .auditor-state/, then opens a new
# Terminal.app window that boots `aletheia-worker <slug>`. The shell
# function lives in scripts/aletheia-functions.sh and must be sourced
# from your ~/.zshrc for the spawn to succeed.

set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "usage: $0 <slug> \"<task>\"" >&2
    exit 1
fi

slug="$1"
shift
task="$*"

if [[ ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
    echo "error: slug must be lowercase alphanumeric with dashes, got: $slug" >&2
    exit 1
fi

repo_root="$(git rev-parse --show-toplevel)"
state_dir="$repo_root/.auditor-state"
mkdir -p "$state_dir"

# Enforce the 5-worker cap.
active=0
shopt -s nullglob
for state_file in "$state_dir"/*.state; do
    s=$(grep '^state=' "$state_file" | head -1 | cut -d= -f2-)
    if [[ "$s" == "running" || "$s" == "blocked" ]]; then
        active=$((active + 1))
    fi
done
shopt -u nullglob
if [[ "$active" -ge 5 ]]; then
    echo "error: $active workers already active (cap is 5)" >&2
    echo "       merge or fail an existing worker before spawning another." >&2
    exit 1
fi

worktree_path="${repo_root%/*}/aletheia-${slug}"
branch="feature/${slug}"

# Refuse if a worker with this slug is already in flight.
if [[ -f "$state_dir/$slug.state" ]]; then
    existing_state=$(grep '^state=' "$state_dir/$slug.state" | head -1 | cut -d= -f2-)
    if [[ "$existing_state" == "running" || "$existing_state" == "blocked" ]]; then
        echo "error: worker '$slug' is already $existing_state" >&2
        echo "       send it a message with talk-to-worker.sh or merge it first." >&2
        exit 1
    fi
fi

# Create the worktree if it does not exist.
if [[ ! -d "$worktree_path" ]]; then
    "$repo_root/scripts/new-worktree.sh" "$slug"
fi

session_id=$(uuidgen | tr '[:upper:]' '[:lower:]')
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "$task" > "$state_dir/$slug.task"
cat > "$state_dir/$slug.state" <<EOF
slug=$slug
state=running
spawned_at=$now
updated_at=$now
worktree_path=$worktree_path
branch=$branch
session_id=$session_id
summary=
blocked_reason=
EOF

# Make sure any stale mailbox from a previous worker with this slug is gone.
rm -f "$state_dir/$slug.mailbox"

# Open a new Terminal.app window running aletheia-worker.
# The function is defined in scripts/aletheia-functions.sh, which the
# user must source from ~/.zshrc. If it is not sourced, the new
# Terminal window will print "command not found: aletheia-worker".
osascript <<APPLESCRIPT >/dev/null
tell application "Terminal"
    activate
    do script "cd '$worktree_path' && aletheia-worker '$slug'"
end tell
APPLESCRIPT

echo "spawned worker: $slug"
echo "  worktree:   $worktree_path"
echo "  branch:     $branch"
echo "  session_id: $session_id"
echo "  task:       $task"
