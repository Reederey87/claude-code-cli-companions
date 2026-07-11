---
description: Archive (or with --delete, permanently delete) Codex sessions left over from finished companion jobs
argument-hint: '[--delete]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" cleanup --json $ARGUMENTS`

Present the full command output to the user. Do not summarize or condense it.
