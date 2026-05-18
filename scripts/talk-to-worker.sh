#!/usr/bin/env bash
# Send a message to a worker.
#
# Usage:
#   ./scripts/talk-to-worker.sh <slug> "<message>"
#
# Phase 1 behavior:
#   - Appends the message to the worker's mailbox file at
#     .auditor-state/<slug>.mailbox. The worker is instructed via
#     WORKER.md to read the mailbox at the start of each turn.
#   - If the worker's state is `blocked`, also flips it back to
#     `running` (the auditor's response is presumed to unblock).
#   - Best-effort: brings the worker's Terminal window to the front so
#     the human can see there is a pending message.
#
# Phase 2 (TODO): also deliver the message as a keystroke into the
# worker's Terminal so the running Claude session sees it as the next
# user prompt without the human or worker having to act.

set -euo pipefail

if [[ $# -lt 2 ]]; then
    echo "usage: $0 <slug> \"<message>\"" >&2
    exit 1
fi

slug="$1"
shift
message="$*"

repo_root="$(git rev-parse --show-toplevel)"
state_dir="$repo_root/.auditor-state"
state_file="$state_dir/$slug.state"
mailbox="$state_dir/$slug.mailbox"

if [[ ! -f "$state_file" ]]; then
    echo "error: no worker $slug" >&2
    exit 1
fi

# Append to mailbox; multiple messages stack with --- separators.
if [[ -f "$mailbox" ]]; then
    {
        echo ""
        echo "---"
        echo ""
    } >> "$mailbox"
fi
echo "$message" >> "$mailbox"

# If the worker was blocked, the auditor's reply is presumed to unblock.
state=$(grep '^state=' "$state_file" | head -1 | cut -d= -f2-)
if [[ "$state" == "blocked" ]]; then
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    tmp=$(mktemp)
    while IFS= read -r line; do
        case "$line" in
            state=*)          echo "state=running" ;;
            updated_at=*)     echo "updated_at=$now" ;;
            blocked_reason=*) echo "blocked_reason=" ;;
            *)                echo "$line" ;;
        esac
    done < "$state_file" > "$tmp"
    mv "$tmp" "$state_file"
fi

# Best-effort: bring the worker's Terminal window to the front. The
# worker's Terminal window has a custom name set via `claude --name
# worker:<slug>`, which Claude propagates to the terminal title.
osascript <<APPLESCRIPT 2>/dev/null || true
tell application "Terminal"
    repeat with w in windows
        if name of w contains "worker:$slug" then
            set index of w to 1
            activate
            exit repeat
        end if
    end repeat
end tell
APPLESCRIPT

echo "message queued for $slug at $mailbox"
echo "the worker will read it on its next turn (or run"
echo "  aletheia-worker-resume $slug"
echo "from inside its worktree if its session has exited)."
