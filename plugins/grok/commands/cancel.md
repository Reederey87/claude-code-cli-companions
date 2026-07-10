---
description: Cancel an active background Grok Build job in this repository
argument-hint: '[job-id]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" cancel "$ARGUMENTS"`

Without a job-id, cancels the latest active Grok job for the current Claude session. With an explicit job-id, cancels that job across sessions.
