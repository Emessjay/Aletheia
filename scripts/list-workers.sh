#!/usr/bin/env bash
# List all worker state. Used by the auditor for situational awareness.
#
# Usage:
#   ./scripts/list-workers.sh         # active workers only
#   ./scripts/list-workers.sh --all   # including merged
#
# Output is one line per worker, plus a "BLOCKED" callout at the end
# for any worker that needs the auditor's attention.

set -euo pipefail

show_all=0
if [[ "${1:-}" == "--all" ]]; then
    show_all=1
fi

repo_root="$(git rev-parse --show-toplevel)"
state_dir="$repo_root/.auditor-state"

shopt -s nullglob
state_files=("$state_dir"/*.state)
shopt -u nullglob

if [[ ${#state_files[@]} -eq 0 ]]; then
    echo "no workers"
    exit 0
fi

# Headline the tmux attach command if any workers are alive in tmux.
if command -v tmux >/dev/null 2>&1 \
   && tmux has-session -t aletheia-workers 2>/dev/null; then
    live_count=$(tmux list-windows -t aletheia-workers 2>/dev/null | wc -l | tr -d ' ')
    echo "tmux: aletheia-workers session has $live_count window(s) — attach with: tmux attach -t aletheia-workers"
    echo
fi

printf "%-32s %-9s %-40s %-7s %-8s\n" "SLUG" "STATE" "BRANCH" "AHEAD" "AGE"

blocked_slugs=()

for state_file in "${state_files[@]}"; do
    slug=$(grep '^slug=' "$state_file" | head -1 | cut -d= -f2-)
    state=$(grep '^state=' "$state_file" | head -1 | cut -d= -f2-)
    branch=$(grep '^branch=' "$state_file" | head -1 | cut -d= -f2-)
    spawned=$(grep '^spawned_at=' "$state_file" | head -1 | cut -d= -f2-)

    if [[ "$show_all" -eq 0 && "$state" == "merged" ]]; then
        continue
    fi

    # Count commits ahead of main.
    ahead="-"
    if git -C "$repo_root" rev-parse --verify "$branch" >/dev/null 2>&1; then
        ahead=$(git -C "$repo_root" rev-list --count "main..$branch" 2>/dev/null || echo "?")
    fi

    # Compute age from spawned_at. -u is critical: spawned_at is in UTC,
    # and without it macOS `date -j -f` would parse it as local time.
    age="?"
    if spawned_epoch=$(date -j -u -f "%Y-%m-%dT%H:%M:%SZ" "$spawned" "+%s" 2>/dev/null); then
        now_epoch=$(date -u +%s)
        diff=$((now_epoch - spawned_epoch))
        if   [[ "$diff" -lt 60 ]];    then age="${diff}s"
        elif [[ "$diff" -lt 3600 ]];  then age="$((diff / 60))m"
        elif [[ "$diff" -lt 86400 ]]; then age="$((diff / 3600))h"
        else                               age="$((diff / 86400))d"
        fi
    fi

    printf "%-32s %-9s %-40s %-7s %-8s\n" "$slug" "$state" "$branch" "$ahead" "$age"

    if [[ "$state" == "blocked" ]]; then
        blocked_slugs+=("$slug")
    fi
done

if [[ ${#blocked_slugs[@]} -gt 0 ]]; then
    echo
    echo "BLOCKED workers need attention:"
    for slug in "${blocked_slugs[@]}"; do
        reason=$(grep '^blocked_reason=' "$state_dir/$slug.state" | head -1 | cut -d= -f2-)
        echo "  $slug: $reason"
    done
fi
