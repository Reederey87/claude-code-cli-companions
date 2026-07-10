---
description: Show active and recent Grok Build jobs for the current repository
argument-hint: '[job-id] [--json]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" status "$ARGUMENTS"`

Present the complete output without starting or changing a job.
