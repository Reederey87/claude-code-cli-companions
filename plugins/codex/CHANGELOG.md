# Changelog

## 1.0.8

- Failed reviews now surface the underlying Codex error (e.g. model-rejected 400s) in the rendered output instead of a bare "Reviewer failed to output a response".
- Opt-in model fallback: set `CLAUDE_PLUGIN_OPTION_FALLBACK_MODEL` to retry review/adversarial-review/task runs once when the account rejects the requested model.
- `/codex:setup --doctor` runs `codex doctor --json` and folds failing checks into the setup report; degrades gracefully on Codex versions without the subcommand.
- New `/codex:cleanup [--delete]` archives (or permanently deletes) Codex sessions left over from finished companion jobs, preserving the newest resumable task thread.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
