# Changelog

## 1.0.9

- Job state is keyed by the shared main-repo root, so jobs launched from linked git worktrees are visible to `/codex:status`, `/codex:result`, and `/codex:cancel` from any checkout. Legacy worktree-keyed state is read-merged without being modified; plain (non-worktree) repos keep their exact previous state key.
- `/codex:status` shows "last activity Xm ago" for running jobs (derived from the job log) and adds an advisory once a running job has produced no new events for 5+ minutes, replacing blind periodic polling.
- Write-enabled task runs capture a git before/after write summary (changed files, or an explicit "no edits landed" note) rendered after the final output — independent evidence of what actually changed.
- Model-fallback regression coverage now spans the task and adversarial-review paths, including the fallback-also-rejected and same-model-guard cases.
- `codex-rescue` agent hardening: scope rules (report only, commit nothing, one writer per worktree, `--cwd` forwarding for foreign checkouts) and a failure contract that returns companion stdout/stderr verbatim on non-zero exit instead of returning nothing.

## 1.0.8

- Failed reviews now surface the underlying Codex error (e.g. model-rejected 400s) in the rendered output instead of a bare "Reviewer failed to output a response".
- Opt-in model fallback: set `CLAUDE_PLUGIN_OPTION_FALLBACK_MODEL` to retry review/adversarial-review/task runs once when the account rejects the requested model.
- `/codex:setup --doctor` runs `codex doctor --json` and folds failing checks into the setup report; degrades gracefully on Codex versions without the subcommand.
- New `/codex:cleanup [--delete]` archives (or permanently deletes) Codex sessions left over from finished companion jobs, preserving the newest resumable task thread.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
