# Security Policy

## Supported Versions

Only the latest release of this fork is actively supported with security fixes.

| Version | Supported          |
|---------|--------------------|
| latest  | ✅                 |
| < 1.0   | ❌                 |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report suspected vulnerabilities privately using GitHub's **Report a
vulnerability** feature on the
[Security tab](https://github.com/Reederey87/codex-plugin-cc/security/advisories/new)
(Private Vulnerability Reporting). This creates a private security advisory
visible only to repository maintainers.

When reporting, please include:

- A clear description of the issue and its potential impact.
- Steps to reproduce, including any relevant plugin commands or inputs.
- The affected file(s) or command(s), if known.
- Any suggested mitigation or fix.

You will receive an acknowledgment within **5 business days**. We will work with
you to assess the report and coordinate a fix and disclosure timeline. Valid
reports will be credited unless you prefer to remain anonymous.

## Scope

This policy covers the **plugin code in this repository** (the Codex and Grok
Claude Code plugins, their scripts, hooks, commands, and schemas).

It does **not** cover:

- The **Codex CLI** itself (`@openai/codex`) — report to
  [OpenAI](https://help.openai.com/) or the
  [upstream repo](https://github.com/openai/codex-plugin-cc).
- The **Grok Build CLI** itself — report to [xAI](https://docs.x.ai/build).
- Your own API keys, tokens, or credentials — we cannot reset or rotate them.

## Security-Conscious Contributing

- Never commit secrets, API keys, or tokens. The wrapped CLIs handle
  authentication; this plugin stores only job/session state under
  `.claude/plugins/codex/` (gitignored).
- Shell command construction in this repo quotes all user-supplied arguments
  (`"$ARGUMENTS"`) to prevent injection. Preserve this pattern in any new
  `!`-prefixed shell command.
- Keep the review/timeout gates intact when modifying hooks.
