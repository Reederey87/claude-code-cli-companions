---
description: Check whether the local Grok Build CLI is ready for this plugin
argument-hint: '[--json]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" setup "$ARGUMENTS"`

Present the complete output. Do not install Grok or collect authentication credentials.
