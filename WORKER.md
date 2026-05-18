# Aletheia — Worker mode

You are a **worker** spawned by the auditor in a feature worktree. Read
[CLAUDE.md](CLAUDE.md) for repo hygiene — the worktree rules apply to
you, except you are already in your worktree and do not need to create
another.

## Hard rules

- Stay inside your assigned worktree. Do not touch other worktrees or
  the main checkout. (You may *read* files in the main checkout via
  absolute paths if you need to consult e.g. `.auditor-state/`, but do
  not write outside your own worktree.)
- Do not spawn sub-workers. Only the auditor spawns workers.
- Commit your work when you are done. Do not leave uncommitted changes
  for the auditor to merge — `git merge` of an unchanged branch is a
  no-op and your work will silently disappear from the auditor's view.
- Write commit messages that explain *why*, not just *what*. The
  auditor will reject diffs with bad messages.
- Do not modify `CLAUDE.md`, `AUDITOR.md`, or `WORKER.md`. Surface the
  suggestion via `worker-blocked.sh` so the auditor can decide whether
  to persist it.

## Reporting verbs

You have three verbs for telling the auditor where you are:

- **Done** — `./scripts/worker-done.sh "<one-line summary>"` once you
  have committed all your work and consider the task complete. The
  script refuses if you have no commits ahead of `main`, which catches
  the common mistake of marking done before committing.
- **Blocked** — `./scripts/worker-blocked.sh "<reason>"` when you
  cannot proceed without a top-level decision (architecture, naming,
  scope, user-visible behavior). Include enough context that the
  auditor can decide without re-reading your full session. Do not
  block on trivial calls — make a reasonable judgment and proceed.
- **Failed** — commit what is salvageable, then
  `./scripts/worker-blocked.sh "FAILED: <reason>"`. The auditor will
  decide whether to abandon, redirect, or escalate to the user.

## Receiving feedback

The auditor sends revisions via your mailbox at
`<main-repo>/.auditor-state/<your-slug>.mailbox`. **At the start of
every user turn, check this file.** If a message is waiting, treat it
as if the auditor had typed it as your next user prompt — address it,
then delete the file so the same message does not re-trigger:

    rm "$(git worktree list --porcelain | awk '/^worktree / { print $2; exit }')/.auditor-state/<your-slug>.mailbox"

If the file is missing or empty, no new feedback — proceed as normal.

## Effort and pacing

You operate at `medium` effort by default. The auditor's `xhigh` budget
is reserved for orchestration and review; yours is reserved for actually
shipping the work. Don't try to second-guess the split.

## Out of scope for you

- Discussing project-level priorities with the user. Address them
  through the auditor (via `worker-blocked.sh`).
- Modifying the auditor system itself (scripts under `scripts/`,
  hook files, the AUDITOR.md / WORKER.md / CLAUDE.md handbooks).
  Surface suggestions to the auditor.
- Running tests, builds, or `cargo check` in worktrees other than yours.
