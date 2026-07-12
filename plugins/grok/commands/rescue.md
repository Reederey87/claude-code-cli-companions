---
description: Delegate investigation, an explicit fix request, or follow-up rescue work to the local Grok Build CLI
argument-hint: '[--background|--wait] [--resume|--fresh] [--write] [--always-approve|--yolo] [--model <model>] [--effort <level>] [--max-turns <n>] [--json-schema <schema>] [what Grok should investigate, solve, or continue]'
allowed-tools: Bash(node:*), AskUserQuestion, Agent
---

Invoke the `grok:grok-rescue` subagent through the `Agent` tool (`subagent_type: "grok:grok-rescue"`), forwarding the raw user request as the prompt. The command runs inline so the `Agent` tool stays in scope.

The final user-visible response must be Grok's output verbatim.

Raw user request:
$ARGUMENTS

Execution mode:

- If the request includes `--background`, run the `grok:grok-rescue` subagent in the background.
- If the request includes `--wait`, run the `grok:grok-rescue` subagent in the foreground.
- If neither flag is present, default to foreground for read-only tasks and to background for `--write` tasks (foreground write jobs die with a misleading Cancelled stop when the parent call is cut).
- `--background` and `--wait` are execution flags for Claude Code. Do not forward them to `task`, and do not treat them as part of the natural-language task text.
- `--model`, `--effort`, `--max-turns`, and `--json-schema` are runtime-selection flags. Preserve them for the forwarded `task` call, but do not treat them as part of the natural-language task text.
- `--resume` and `--fresh` are routing controls. Preserve them for the forwarded `task` call, but do not treat them as part of the natural-language task text.
- If the request includes `--resume`, do not ask whether to continue. The user already chose.
- If the request includes `--fresh`, do not ask whether to continue. The user already chose.
- Otherwise, before starting Grok, check for a resumable rescue task from this Claude session by running:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" task-resume-candidate --json
```

- If that helper reports `available: true`, use `AskUserQuestion` exactly once to ask whether to continue the current Grok task or start a new one.
- The two choices must be:
  - `Continue current Grok task`
  - `Start a new Grok task`
- If the user is clearly giving a follow-up instruction such as "continue", "keep going", "resume", "apply the top fix", or "dig deeper", put `Continue current Grok task (Recommended)` first.
- Otherwise put `Start a new Grok task (Recommended)` first.
- If the user chooses continue, add `--resume` before routing to the subagent.
- If the user chooses a new task, add `--fresh` before routing to the subagent.
- If the helper reports `available: false`, do not ask. Route normally.

Write safety:

- Keep review, diagnosis, and research tasks strictly read-only.
- For a bounded implementation request with a predefined plan or concrete fix, default to adding `--write`.
- Forward `--write` when the user explicitly supplied it, even when the task wording is ambiguous.
- Forward `--always-approve` only when the user explicitly supplied it. Treat `--yolo` as its alias.
- A background write task requires explicit `--always-approve` or `--yolo`. Do not start it without that approval.
- A job may finish with status incomplete — verify the write summary / git diff before trusting the narrative.
- If the user did not supply a request, ask what Grok should investigate or fix.

Operating rules:

- The subagent is a thin forwarder only. It should use one `Bash` call to invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" task ...` and return that command's stdout as-is.
- Return the Grok companion stdout verbatim to the user.
- Do not paraphrase, summarize, rewrite, or add commentary before or after it.
- Do not ask the subagent to inspect files, monitor progress, poll `/grok:status`, fetch `/grok:result`, summarize output, or do follow-up work of its own.
