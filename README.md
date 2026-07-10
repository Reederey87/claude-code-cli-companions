# Coding CLI Companions for Claude Code

Use Codex and Grok Build from inside Claude Code for code reviews, delegated tasks, and second-opinion analysis.

This repository packages two Claude Code plugins that wrap local coding CLIs:

- **Codex** (`/codex:*`) delegates to the [OpenAI Codex CLI](https://developers.openai.com/codex/cli/) for reviews, rescue tasks, and session transfer.
- **Grok** (`/grok:*`) delegates to the [xAI Grok Build CLI](https://docs.x.ai/build) for read-only questions, reviews, and rescue tasks.

<video src="./docs/plugin-demo.webm" controls muted playsinline autoplay></video>

## What You Get

### Codex

- `/codex:review` for a normal read-only Codex review
- `/codex:adversarial-review` for a steerable challenge review
- `/codex:rescue`, `/codex:transfer`, `/codex:status`, `/codex:result`, and `/codex:cancel` to delegate work, hand off sessions, and manage background jobs

### Grok

- `/grok:setup` to check Grok Build CLI availability and auth
- `/grok:ask` for a read-only repository question
- `/grok:review` for a read-only Grok Build review of local git changes
- `/grok:rescue` for diagnosis, planning, or implementation with explicit write mode
- `/grok:status`, `/grok:result`, and `/grok:cancel` to manage background jobs

## Requirements

### Codex

- **ChatGPT subscription (incl. Free) or OpenAI API key.**
  - Usage will contribute to your Codex usage limits. [Learn more](https://developers.openai.com/codex/pricing).
- **Node.js 18.18 or later**

### Grok

- **Grok Build CLI installed and authenticated** (`grok login`).
  - A Grok subscription or `XAI_API_KEY` environment variable is required. [Learn more](https://docs.x.ai/build).
- **Node.js 18.18 or later**

## Install

Add the marketplace in Claude Code:

```text
/plugin marketplace add openai/codex-plugin-cc
```

Install the plugins you need:

```text
/plugin install codex@openai-codex
```

Reload plugins:

```text
/reload-plugins
```

Then run:

```text
/codex:setup
```

`/codex:setup` will tell you whether Codex is ready. If Codex is missing and npm is available, it can offer to install Codex for you.

If you prefer to install Codex yourself, use:

```bash
npm install -g @openai/codex
```

If Codex is installed but not logged in yet, run:

```bash
!codex login
```

### Installing both Codex and Grok from this fork

If you want to use both plugins from this repository's marketplace (`coding-cli-companions`):

```text
/plugin marketplace add openai/codex-plugin-cc
/plugin install codex@openai-codex
```

Or, if you are testing from a local checkout:

```text
/plugin marketplace add /path/to/codex-plugin-cc
/plugin install codex@coding-cli-companions
/plugin install grok@coding-cli-companions
```

> [!NOTE]
> Do not install the fork's `codex` plugin alongside the official Codex plugin, because both use the `codex` plugin name. The Grok plugin uses the separate `/grok:*` namespace and does not conflict.

After installing the Grok plugin, run:

```text
/grok:setup
```

If Grok is not installed yet, use the [official installer](https://docs.x.ai/build):

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
grok login
```

For headless or remote hosts, use `grok login --device-auth`.

After install, you should see:

- the slash commands listed below
- the `codex:codex-rescue` subagent in `/agents`

One simple first run is:

```bash
/codex:review --background
/codex:status
/codex:result
```

## Usage

### `/codex:review`

Runs a normal Codex review on your current work. It gives you the same quality of code review as running `/review` inside Codex directly.

> [!NOTE]
> Code review especially for multi-file changes might take a while. It's generally recommended to run it in the background.

Use it when you want:

- a review of your current uncommitted changes
- a review of your branch compared to a base branch like `main`

Use `--base <ref>` for branch review. It also supports `--wait` and `--background`. It is not steerable and does not take custom focus text. Use [`/codex:adversarial-review`](#codexadversarial-review) when you want to challenge a specific decision or risk area.

Examples:

```bash
/codex:review
/codex:review --base main
/codex:review --background
```

This command is read-only and will not perform any changes. When run in the background you can use [`/codex:status`](#codexstatus) to check on the progress and [`/codex:cancel`](#codexcancel) to cancel the ongoing task.

### `/codex:adversarial-review`

Runs a **steerable** review that questions the chosen implementation and design.

It can be used to pressure-test assumptions, tradeoffs, failure modes, and whether a different approach would have been safer or simpler.

It uses the same review target selection as `/codex:review`, including `--base <ref>` for branch review.
It also supports `--wait` and `--background`. Unlike `/codex:review`, it can take extra focus text after the flags.

Use it when you want:

- a review before shipping that challenges the direction, not just the code details
- review focused on design choices, tradeoffs, hidden assumptions, and alternative approaches
- pressure-testing around specific risk areas like auth, data loss, rollback, race conditions, or reliability

Examples:

```bash
/codex:adversarial-review
/codex:adversarial-review --base main challenge whether this was the right caching and retry design
/codex:adversarial-review --background look for race conditions and question the chosen approach
```

This command is read-only. It does not fix code.

### `/codex:rescue`

Hands a task to Codex through the `codex:codex-rescue` subagent.

Use it when you want Codex to:

- investigate a bug
- try a fix
- continue a previous Codex task
- take a faster or cheaper pass with a smaller model

> [!NOTE]
> Depending on the task and the model you choose these tasks might take a long time and it's generally recommended to force the task to be in the background or move the agent to the background.

It supports `--background`, `--wait`, `--resume`, and `--fresh`. If you omit `--resume` and `--fresh`, the plugin can offer to continue the latest rescue thread for this repo.

Examples:

```bash
/codex:rescue investigate why the tests started failing
/codex:rescue fix the failing test with the smallest safe patch
/codex:rescue --resume apply the top fix from the last run
/codex:rescue --model gpt-5.4-mini --effort medium investigate the flaky integration test
/codex:rescue --model spark fix the issue quickly
/codex:rescue --background investigate the regression
```

You can also just ask for a task to be delegated to Codex:

```text
Ask Codex to redesign the database connection to be more resilient.
```

**Notes:**

- if you do not pass `--model` or `--effort`, Codex chooses its own defaults.
- if you say `spark`, the plugin maps that to `gpt-5.3-codex-spark`
- follow-up rescue requests can continue the latest Codex task in the repo

### `/codex:transfer`

Creates a persistent Codex thread from the current Claude Code session and prints a `codex resume <session-id>` command.

Use it when you started a debugging or implementation conversation in Claude Code and want to continue that same context directly in Codex.

Examples:

```bash
/codex:transfer
/codex:transfer --source ~/.claude/projects/-Users-me-repo/<session-id>.jsonl
```

The plugin's existing `SessionStart` hook supplies the current transcript path automatically; `--source` is available as a manual override. The transfer uses Codex's external-agent session importer, so it follows the same conversion rules as importing Claude history in the Codex App and creates visible turns that can be continued in the App or TUI. The source must be under `~/.claude/projects`, and older Codex versions that do not expose session import must be upgraded before using this command.

### `/codex:status`

Shows running and recent Codex jobs for the current repository.

Examples:

```bash
/codex:status
/codex:status task-abc123
```

Use it to:

- check progress on background work
- see the latest completed job
- confirm whether a task is still running

### `/codex:result`

Shows the final stored Codex output for a finished job.
When available, it also includes the Codex session ID so you can reopen that run directly in Codex with `codex resume <session-id>`.

Examples:

```bash
/codex:result
/codex:result task-abc123
```

### `/codex:cancel`

Cancels an active background Codex job.

Examples:

```bash
/codex:cancel
/codex:cancel task-abc123
```

### `/codex:setup`

Checks whether Codex is installed and authenticated.
If Codex is missing and npm is available, it can offer to install Codex for you.

You can also use `/codex:setup` to manage the optional review gate.

#### Enabling review gate

```bash
/codex:setup --enable-review-gate
/codex:setup --disable-review-gate
```

When the review gate is enabled, the plugin uses a `Stop` hook to run a targeted Codex review based on Claude's response. If that review finds issues, the stop is blocked so Claude can address them first.

> [!WARNING]
> The review gate can create a long-running Claude/Codex loop and may drain usage limits quickly. Only enable it when you plan to actively monitor the session.

## Grok Commands

### `/grok:setup`

Checks whether the local Grok Build CLI is installed and authenticated.

```text
/grok:setup
```

### `/grok:ask`

Asks the Grok Build CLI a read-only question about the current repository. Runs with `--sandbox read-only` and `--permission-mode dontAsk`.

```text
/grok:ask Explain the architecture of this repo and identify risky areas.
```

### `/grok:review`

Runs a read-only Grok Build review of local git changes. Supports `--base <ref>` for branch comparison, `--scope working-tree|branch|repo`, `--background`, and `--model`.

```text
/grok:review
/grok:review --base main
/grok:review --scope branch --base main --background
```

This command is read-only and will not modify files.

### `/grok:rescue`

Delegates a diagnosis, planning, or implementation task to the Grok Build CLI.

- Without `--write`: read-only diagnosis or plan.
- With `--write --always-approve`: Grok may edit files in the current Git workspace. All headless writes require explicit `--always-approve` or `--yolo`.
- Supports `--background`, `--wait`, `--resume`, `--fresh`, and `--model`.

```text
/grok:rescue investigate why tests fail and propose the smallest safe patch
/grok:rescue --write --always-approve fix the failing test with the smallest safe patch
/grok:rescue --write --yolo --background implement the typed config parser and run tests
```

> [!NOTE]
> Write mode requires a Git repository and explicit `--always-approve`. The plugin captures `git diff --name-only HEAD` before and after writes and reports changed files.

### `/grok:status`

Shows active and recent Grok jobs for the current repository.

```text
/grok:status
/grok:status grok-task-abc123
```

### `/grok:result`

Shows the stored final output for a finished Grok job.

```text
/grok:result
/grok:result grok-task-abc123
```

### `/grok:cancel`

Cancels an active background Grok job. Without a job-id, cancels the latest active job in the current Claude session. With an explicit job-id, cancels that job across sessions.

```text
/grok:cancel
/grok:cancel grok-task-abc123
```

## Typical Flows

### Review Before Shipping

```bash
/codex:review
```

### Hand A Problem To Codex

```bash
/codex:rescue investigate why the build is failing in CI
```

### Start Something Long-Running

```bash
/codex:adversarial-review --background
/codex:rescue --background investigate the flaky test
```

Then check in with:

```bash
/codex:status
/codex:result
```

### Grok Second-Opinion Review

```text
/grok:review --background
/grok:status
/grok:result
```

### Grok Low-Cost Implementation

```text
/grok:rescue --write --always-approve implement the typed config parser
/grok:status
/grok:result
```

## Codex Integration

The Codex plugin wraps the [Codex app server](https://developers.openai.com/codex/app-server). It uses the global `codex` binary installed in your environment and [applies the same configuration](https://developers.openai.com/codex/config-basic).

### Common Configurations

If you want to change the default reasoning effort or the default model that gets used by the plugin, you can define that inside your user-level or project-level `config.toml`. For example to always use `gpt-5.4-mini` on `high` for a specific project you can add the following to a `.codex/config.toml` file at the root of the directory you started Claude in:

```toml
model = "gpt-5.4-mini"
model_reasoning_effort = "high"
```

Your configuration will be picked up based on:

- user-level config in `~/.codex/config.toml`
- project-level overrides in `.codex/config.toml`
- project-level overrides only load when the [project is trusted](https://developers.openai.com/codex/config-advanced#project-config-files-codexconfigtoml)

Check out the Codex docs for more [configuration options](https://developers.openai.com/codex/config-reference).

### Moving The Work Over To Codex

Delegated tasks and any [stop gate](#what-does-the-review-gate-do) run can also be directly resumed inside Codex by running `codex resume` either with the specific session ID you received from running `/codex:result` or `/codex:status` or by selecting it from the list.

This way you can review the Codex work or continue the work there.

## Grok Build Integration

The Grok plugin wraps the [Grok Build CLI](https://docs.x.ai/build). It invokes the local `grok` binary in headless mode (`grok -p`) with read-only or workspace-write sandbox profiles.

### How It Works

- **Read-only commands** (`ask`, `review`, read-only `rescue`) use `--sandbox read-only --permission-mode dontAsk` with explicit allow/deny rules for read operations and secret-path protection.
- **Write commands** (`rescue --write --always-approve`) use `--sandbox workspace --permission-mode acceptEdits` with secret-path and destructive-Git deny rules. The plugin captures Git status before and after writes.
- **Background jobs** run as detached workers with persisted state under `${CLAUDE_PLUGIN_DATA}`. Session lifecycle hooks clean up active jobs when the Claude session ends.
- **Session resume** generates a UUID for each fresh task and passes it via `--session-id`. Resuming a task reuses the stored session ID with `--resume`.

### Configuration

The Grok plugin exposes two user-config options in the plugin manifest:

| Option | Default | Description |
|--------|---------|-------------|
| `default_model` | `grok-4.5` | Model passed to `grok -m` when `--model` is not specified |
| `api_fallback_enabled` | `false` | Reserved for a future read-only xAI API fallback |

Model resolution order: explicit `--model` flag, then `CLAUDE_PLUGIN_OPTION_DEFAULT_MODEL`, then the Grok CLI default.

### What Is Not Yet Implemented

- `/grok:adversarial-review` - use `/grok:review` with a challenging prompt for now
- `/grok:transfer` - session transfer from Claude Code to Grok Build
- API fallback via `XAI_API_KEY` when the local CLI is unavailable

## FAQ

### Do I need a separate Codex account for this plugin?

If you are already signed into Codex on this machine, that account should work immediately here too. This plugin uses your local Codex CLI authentication.

If you only use Claude Code today and have not used Codex yet, you will also need to sign in to Codex with either a ChatGPT account or an API key. [Codex is available with your ChatGPT subscription](https://developers.openai.com/codex/pricing/), and [`codex login`](https://developers.openai.com/codex/cli/reference/#codex-login) supports both ChatGPT and API key sign-in. Run `/codex:setup` to check whether Codex is ready, and use `!codex login` if it is not.

### Does the plugin use a separate Codex runtime?

No. This plugin delegates through your local [Codex CLI](https://developers.openai.com/codex/cli/) and [Codex app server](https://developers.openai.com/codex/app-server/) on the same machine.

That means:

- it uses the same Codex install you would use directly
- it uses the same local authentication state
- it uses the same repository checkout and machine-local environment

### Will it use the same Codex config I already have?

Yes. If you already use Codex, the plugin picks up the same [configuration](#common-configurations).

### Can I keep using my current API key or base URL setup?

Yes. Because the plugin uses your local Codex CLI, your existing sign-in method and config still apply.

If you need to point the built-in OpenAI provider at a different endpoint, set `openai_base_url` in your [Codex config](https://developers.openai.com/codex/config-advanced/#config-and-state-locations).

### Do I need a separate Grok account for the Grok plugin?

If you are already signed into Grok Build on this machine (`grok login`), that authentication works immediately. The plugin uses your local Grok CLI subscription auth, not a separate API key.

If you have not used Grok Build yet, install it and log in:

```bash
curl -fsSL https://x.ai/cli/install.sh | bash
grok login
```

For headless or remote hosts, use `grok login --device-auth`. Run `/grok:setup` to verify.

### Can I use both Codex and Grok plugins at the same time?

Yes. The Codex plugin uses the `/codex:*` namespace and the Grok plugin uses `/grok:*`. They do not conflict. Install both from the same marketplace if you want to use them together.

### Does the Grok plugin use a separate Grok runtime?

No. The plugin invokes your local `grok` binary in headless mode (`grok -p`) on the same machine. It uses the same authentication, configuration, and repository checkout you would use directly.
