#!/usr/bin/env bash
# Create a git worktree for a new feature and install its node_modules.
# See the "Worktree-per-feature" section in CLAUDE.md for context.
#
# Usage:
#   ./scripts/new-worktree.sh <slug>
#
# Creates ../aletheia-<slug> on branch feature/<slug>, then runs `npm install`
# inside it.

set -euo pipefail

if [[ $# -ne 1 || -z "${1:-}" ]]; then
    echo "usage: $0 <slug>" >&2
    exit 1
fi

slug="$1"
repo_root="$(git rev-parse --show-toplevel)"
worktree_path="${repo_root%/*}/aletheia-${slug}"
branch="feature/${slug}"

if [[ -e "$worktree_path" ]]; then
    echo "error: $worktree_path already exists" >&2
    exit 1
fi

git -C "$repo_root" worktree add "$worktree_path" -b "$branch"

cd "$worktree_path"
npm install

echo
echo "Worktree ready: $worktree_path (branch $branch)"
