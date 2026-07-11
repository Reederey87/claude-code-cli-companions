---
description: Delete Grok headless sessions left over from finished companion jobs (only sessions the plugin created)
argument-hint: '[--json]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" cleanup "$ARGUMENTS"`

Present the complete output without starting or changing a job.
