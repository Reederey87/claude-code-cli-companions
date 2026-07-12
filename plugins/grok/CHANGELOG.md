# Changelog

## 0.3.0

- Job status is classified from Grok's JSON `stopReason` (clean = `EndTurn`; ACP `end_turn` also accepted) instead of the process exit code, which is untrustworthy in both directions: external termination exits 0 + `Cancelled` with the diff already flushed, and max-turns exhaustion exits 1 + `Cancelled` where work may have landed.
- New `incomplete` terminal status for early stops: carries evidence (`stopReason`, exit status, changed files), renders a warning banner ("verify against git status/diff before trusting any success narrative"), and exits 2 for foreground jobs so callers can distinguish "verify the diff" from "discard and retry". Requires a Grok CLI that emits `stopReason` in json output.
- Job state is keyed by the shared main-repo root, so jobs launched from linked git worktrees are visible to `/grok:status`, `/grok:result`, and `/grok:cancel` from any checkout. Write locks stay per-worktree (parallel worktree writers keep working), jobs record their originating worktree for display, legacy worktree-keyed job files are read-merged without being modified, and plain repos keep their exact previous state key.
- `/grok:status --all` lists jobs from all Claude sessions; the default session-filtered view prints an honest count of hidden jobs. Running jobs show pid liveness: `running (pid alive, …)`, a warning when the pid is gone, or `liveness unknown` for legacy records.
- `--write` rescue tasks default to background execution (foreground write jobs are killed with a misleading `Cancelled` stop when the parent call is cut); approval rules are unchanged — no silent backgrounding without `--always-approve`/`--yolo`.
- `grok-rescue` agent hardening: scope rules (report only, commit nothing, one writer per worktree, `--cwd` forwarding for foreign checkouts) and a failure contract that returns companion stdout/stderr verbatim on non-zero exit instead of returning nothing.

## 0.2.0

- Initial marketplace version of the Grok Build plugin for Claude Code.
