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

# Invoked by spawn-worker.sh inside a newly-opened Terminal window.
# Reads the task and pre-assigned session ID from the state file at
# <main-repo>/.auditor-state/<slug>.state, then boots Claude in the
# current (worker) worktree.
#
#   aletheia-worker <slug>
aletheia-worker() {
    local slug="$1"
    if [[ -z "$slug" ]]; then
        echo "usage: aletheia-worker <slug>" >&2
        return 1
    fi

    local main_repo
    main_repo=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree / { print $2; exit }')
    if [[ -z "$main_repo" ]]; then
        echo "error: not inside a git repo" >&2
        return 1
    fi

    local state_file="$main_repo/.auditor-state/$slug.state"
    local task_file="$main_repo/.auditor-state/$slug.task"

    if [[ ! -f "$state_file" ]]; then
        echo "error: no state for $slug at $state_file" >&2
        return 1
    fi

    local task=""
    [[ -f "$task_file" ]] && task=$(cat "$task_file")

    local session_id
    session_id=$(grep '^session_id=' "$state_file" | head -1 | cut -d= -f2-)

    local prompt="**read CLAUDE.md and WORKER.md before you start**

Your slug: $slug
Your task:

$task

When done, commit your work and run:
    ./scripts/worker-done.sh \"<one-line summary>\"
If you are blocked on a top-level decision, run:
    ./scripts/worker-blocked.sh \"<reason>\"

The auditor sends revisions via your mailbox at
    $main_repo/.auditor-state/$slug.mailbox
Check it at the start of each turn; delete after acting on it."

    if [[ -n "$session_id" ]]; then
        claude --session-id "$session_id" --effort medium --name "worker:$slug" "$prompt"
    else
        claude --effort medium --name "worker:$slug" "$prompt"
    fi
}

# Resume an existing worker session, optionally delivering a message as
# the next user prompt. Useful if the Terminal window was closed or the
# session exited and the auditor needs to send revisions.
#
#   aletheia-worker-resume <slug>
#   aletheia-worker-resume <slug> "the revision message"
aletheia-worker-resume() {
    local slug="$1"
    shift
    local msg="$*"

    if [[ -z "$slug" ]]; then
        echo "usage: aletheia-worker-resume <slug> [message]" >&2
        return 1
    fi

    local main_repo
    main_repo=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree / { print $2; exit }')
    if [[ -z "$main_repo" ]]; then
        # If we are not currently inside a worktree, infer from
        # the standard main path. Best effort.
        main_repo="$HOME/Programs/Aletheia"
    fi

    local state_file="$main_repo/.auditor-state/$slug.state"
    if [[ ! -f "$state_file" ]]; then
        echo "error: no state for $slug" >&2
        return 1
    fi

    local worktree_path session_id
    worktree_path=$(grep '^worktree_path=' "$state_file" | head -1 | cut -d= -f2-)
    session_id=$(grep '^session_id=' "$state_file" | head -1 | cut -d= -f2-)

    if [[ -z "$session_id" ]]; then
        echo "error: no session_id recorded for $slug; cannot resume" >&2
        return 1
    fi
    if [[ ! -d "$worktree_path" ]]; then
        echo "error: worktree $worktree_path is gone; was it merged?" >&2
        return 1
    fi

    cd "$worktree_path" || return

    if [[ -n "$msg" ]]; then
        claude --resume "$session_id" --effort medium --name "worker:$slug" "$msg"
    else
        claude --resume "$session_id" --effort medium --name "worker:$slug"
    fi
}
