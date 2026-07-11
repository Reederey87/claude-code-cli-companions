---
description: Run a read-only Grok Build review of local git changes
argument-hint: '[--background] [--base <ref>] [--scope working-tree|branch|repo] [--model <model>] [--effort <level>] [--max-turns <n>] [--json-schema <schema>]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" review "$ARGUMENTS"`

This command is review-only. It never applies patches or changes files. `--background` queues a detached read-only worker and returns a job ID for `/grok:status` and `/grok:result`.
