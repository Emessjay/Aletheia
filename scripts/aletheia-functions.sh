# Aletheia shell functions for the auditor / worker system.
#
# Source this from your ~/.zshrc:
#
#     source ~/Programs/Aletheia/scripts/aletheia-functions.sh
#
# The existing `aletheia` / `aletheia-continue` / `aletheia-resume`
# helpers from the old setup are preserved here so you can replace any
# ad-hoc definitions in your dotfiles with a single source line.

# -- existing wrappers (kept for backwards compatibility) ---------------

# Boot a regular Claude Code session in the main Aletheia checkout with
# the CLAUDE.md hygiene reminder prepended.
#   aletheia                    # just the hygiene prompt
#   aletheia "implement X"      # hygiene + task
aletheia() {
    cd ~/Programs/Aletheia || return
    claude "**read CLAUDE.md before you code for essential hygiene instructions**

$*"
}

aletheia-continue() { cd ~/Programs/Aletheia && claude --continue; }
aletheia-resume()   { cd ~/Programs/Aletheia && claude --resume;   }

# -- dashboard ----------------------------------------------------------

# Open a live dashboard of worker state in its own tmux session.
# Re-runs list-workers.sh every 2 seconds via `watch`. Detach with
# Ctrl-b d; the session keeps running in the background.
#
#   aletheia-dashboard
aletheia-dashboard() {
    if ! command -v tmux >/dev/null 2>&1; then
        echo "error: tmux is not installed. Install with: brew install tmux" >&2
        return 1
    fi
    local session="aletheia-dashboard"
    if tmux has-session -t "$session" 2>/dev/null; then
        tmux attach -t "$session"
    else
        local script='cd ~/Programs/Aletheia && while true; do clear; ./scripts/list-workers.sh --all; sleep 2; done'
        tmux new-session -s "$session" "bash -c $(printf '%q' "$script")"
    fi
}

# -- auditor mode -------------------------------------------------------

# Boot the auditor in the main worktree. The auditor is the supervisor;
# it does not write code itself, only delegates and reviews. A
# PreToolUse hook in .claude/settings.json blocks Edit/Write on source
# code when ALETHEIA_ROLE=auditor is set; the docs (AUDITOR.md / etc.)
# remain editable.
#
#   aletheia-audit                                  # just boot the auditor
#   aletheia-audit "add chapter export, fix search" # boot + initial task list
aletheia-audit() {
    cd ~/Programs/Aletheia || return
    local task="$*"
    local prompt="**read AUDITOR.md before you act — you orchestrate other agents, you do not code yourself**"
    if [[ -n "$task" ]]; then
        prompt="$prompt

Initial task: $task"
    fi
    ALETHEIA_ROLE=auditor claude --effort xhigh --name auditor "$prompt"
}

# Resume the most recent auditor session in the main worktree.
aletheia-audit-resume() {
    cd ~/Programs/Aletheia || return
    ALETHEIA_ROLE=auditor claude --effort xhigh --name auditor --continue
}

# -- worker mode --------------------------------------------------------
#
# Workers are spawned by scripts/spawn-worker.sh, which boots them in a
# detached tmux session named "aletheia-workers" (one window per slug).
# The boot itself is handled by scripts/aletheia-worker.sh — it does not
# need to be a shell function because tmux can exec it directly.
#
# Attach to see all live workers:   tmux attach -t aletheia-workers
#
# `aletheia-worker-resume` (below) revives a worker whose tmux window
# has closed, optionally delivering the auditor's queued mailbox content
# and any inline message as its first prompt of the new session.
aletheia-worker-resume() {
    local slug="$1"
    shift
    local msg="$*"

    if [[ -z "$slug" ]]; then
        echo "usage: aletheia-worker-resume <slug> [message]" >&2
        return 1
    fi

    if ! command -v tmux >/dev/null 2>&1; then
        echo "error: tmux is not installed. Install with: brew install tmux" >&2
        return 1
    fi

    local main_repo
    main_repo=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree / { print $2; exit }')
    [[ -z "$main_repo" ]] && main_repo="$HOME/Programs/Aletheia"

    local state_file="$main_repo/.auditor-state/$slug.state"
    if [[ ! -f "$state_file" ]]; then
        echo "error: no state for $slug" >&2
        return 1
    fi

    local worktree_path session_id mailbox queued effort
    worktree_path=$(grep '^worktree_path=' "$state_file" | head -1 | cut -d= -f2-)
    session_id=$(grep '^session_id=' "$state_file" | head -1 | cut -d= -f2-)
    effort=$(grep '^effort=' "$state_file" | head -1 | cut -d= -f2-)
    effort="${effort:-medium}"
    mailbox="$main_repo/.auditor-state/$slug.mailbox"

    if [[ -z "$session_id" ]]; then
        echo "error: no session_id recorded for $slug; cannot resume" >&2
        return 1
    fi
    if [[ ! -d "$worktree_path" ]]; then
        echo "error: worktree $worktree_path is gone; was it merged?" >&2
        return 1
    fi

    # Drain mailbox; if non-empty, prepend it to the resume prompt.
    queued=""
    if [[ -s "$mailbox" ]]; then
        queued=$(cat "$mailbox")
        rm -f "$mailbox"
    fi

    local prompt=""
    if [[ -n "$queued" && -n "$msg" ]]; then
        prompt="(queued mailbox)

$queued

(new message)

$msg"
    elif [[ -n "$queued" ]]; then
        prompt="(queued mailbox)

$queued"
    elif [[ -n "$msg" ]]; then
        prompt="$msg"
    fi

    # If a tmux window for this slug already exists (rare — usually the
    # caller checked first), refuse rather than collide.
    local tmux_session="aletheia-workers"
    if tmux list-windows -t "$tmux_session" -F "#{window_name}" 2>/dev/null \
         | grep -qx "$slug"; then
        echo "error: tmux window $tmux_session:$slug already exists" >&2
        echo "       attach with: tmux attach -t $tmux_session"        >&2
        return 1
    fi

    # Build the claude command. Quote the prompt only if non-empty; an
    # empty prompt would leave the worker idle at its previous state,
    # which is fine.
    local cmd
    if [[ -n "$prompt" ]]; then
        cmd="claude --resume $(printf '%q' "$session_id") --effort $(printf '%q' "$effort") --name $(printf '%q' "worker:$slug") $(printf '%q' "$prompt")"
    else
        cmd="claude --resume $(printf '%q' "$session_id") --effort $(printf '%q' "$effort") --name $(printf '%q' "worker:$slug")"
    fi

    if tmux has-session -t "$tmux_session" 2>/dev/null; then
        tmux new-window -t "$tmux_session:" -n "$slug" -c "$worktree_path" "$cmd"
    else
        tmux new-session -d -s "$tmux_session" -n "$slug" -c "$worktree_path" "$cmd"
    fi

    echo "resumed worker $slug in tmux."
    echo "attach with: tmux attach -t $tmux_session"
}
