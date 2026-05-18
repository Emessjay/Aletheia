#!/usr/bin/env bash
# Boot a worker Claude session inside a tmux window.
#
# Usage:
#   aletheia-worker.sh <slug>
#
# Called by spawn-worker.sh inside the tmux window it creates. Not
# typically invoked directly. Reads the task and pre-assigned session
# ID from .auditor-state/<slug>.state in the main repo (resolved via
# `git worktree list`) and execs claude.
#
# This is a standalone script (not a shell function) because tmux's
# new-window command runs a non-interactive shell which would not
# source ~/.zshrc.

set -euo pipefail

slug="${1:-}"
if [[ -z "$slug" ]]; then
    echo "usage: $0 <slug>" >&2
    exit 1
fi

main_repo=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree / { print $2; exit }')
if [[ -z "$main_repo" ]]; then
    echo "error: not inside a git repo" >&2
    exit 1
fi

state_file="$main_repo/.auditor-state/$slug.state"
task_file="$main_repo/.auditor-state/$slug.task"

if [[ ! -f "$state_file" ]]; then
    echo "error: no state for $slug at $state_file" >&2
    exit 1
fi

task=""
[[ -f "$task_file" ]] && task=$(cat "$task_file")
session_id=$(grep '^session_id=' "$state_file" | head -1 | cut -d= -f2-)
effort=$(grep '^effort=' "$state_file" | head -1 | cut -d= -f2-)
effort="${effort:-medium}"

prompt="**read CLAUDE.md and WORKER.md before you start**

Your slug: $slug
Your task:

$task

When done, commit your work and run:
    ./scripts/worker-done.sh \"<one-line summary>\"
If you are blocked on a top-level decision, run:
    ./scripts/worker-blocked.sh \"<reason>\"

The auditor will deliver revisions by injecting them directly into your
terminal via tmux. You do not need to poll any file for them — they
will simply appear as a new user prompt. The mailbox at
    $main_repo/.auditor-state/$slug.mailbox
is a fallback for the rare case that the auditor sent a message while
your session was offline; check it once on startup."

export ALETHEIA_ROLE=worker
export ALETHEIA_WORKER_SLUG="$slug"

if [[ -n "$session_id" ]]; then
    exec claude --session-id "$session_id" --effort "$effort" --name "worker:$slug" "$prompt"
else
    exec claude --effort "$effort" --name "worker:$slug" "$prompt"
fi
