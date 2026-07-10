---
description: Show the stored final output for a finished Grok Build job
argument-hint: '[job-id] [--json]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" result "$ARGUMENTS"`

Present the complete output without modifying files.
