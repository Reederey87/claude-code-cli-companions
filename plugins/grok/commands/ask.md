---
description: Ask the local Grok Build CLI a read-only question about the current repository
argument-hint: '[--model <model>] [question]'
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/grok-companion.mjs" ask "$ARGUMENTS"`

The companion preserves the raw arguments, runs Grok with a read-only sandbox, and returns its output. Do not edit files or add flags.
