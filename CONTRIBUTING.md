# Contributing to Coding CLI Companions

First off, thanks for taking the time to contribute! 🎉

This repository (`Reederey87/codex-plugin-cc`) is a **fork** of
[`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc). It ships
the upstream Codex plugin plus a sibling **Grok Build** plugin and a few
fork-specific changes. All contributions are welcome and merged under the
[Apache-2.0 license](./LICENSE) that covers this project.

> **Upstream vs. fork:** Bug fixes or features that apply to the *upstream* Codex
> plugin should be contributed to
> [`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) so
> everyone benefits. Changes that are specific to this fork (e.g. the Grok
> plugin, fork-only install paths, fork packaging) belong here.

## Code of Conduct

Participation in this project is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md). By contributing, you agree to uphold it.
Please report unacceptable behavior to the maintainer listed there.

## Before You Start

- **Node.js 18.18 or later** (CI runs on Node 22).
- **npm** for dependency management.
- The build step generates TypeScript types from the Codex app-server via
  `codex app-server generate-ts`, so the **Codex CLI** must be installed and on
  `PATH` for `npm run build`. CI installs `@openai/codex` globally for this
  reason. (`npm test` does not require it.)

## Development Setup

```bash
git clone https://github.com/Reederey87/codex-plugin-cc.git
cd codex-plugin-cc
npm ci
npm install -g @openai/codex   # required by npm run build (prebuild step)
```

## Build, Test, and Lint

```bash
npm test          # Node.js built-in test runner (tests/*.test.mjs)
npm run build     # tsc type-check (runs prebuild → codex app-server generate-ts)
npm run check-version   # CI version gate
```

There is no linter or formatter configured; match the style of the surrounding
code. See [`AGENTS.md`](./AGENTS.md) for the authoritative coding style, naming,
and testing conventions.

## Issue Workflow

Issues are enabled on this fork for **fork-specific** bugs and features (e.g. the
Grok plugin, fork install paths). Use the issue templates:

- 🐛 **Bug report** — something is broken in *this fork's* code.
- ✨ **Feature request** — a new capability for this fork.

For bugs in the **upstream** Codex CLI or its plugin, file them at
[`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc/issues).

For **security-sensitive** reports, do **not** open a public issue. See
[SECURITY.md](./SECURITY.md).

## Pull Request Workflow

`main` is a **protected branch**. All changes land through a pull request that
passes CI and receives maintainer approval before merging.

1. **Fork** the repo (if you haven't) and clone your fork.
2. **Create a branch** off `main`:
   ```bash
   git checkout -b feat/short-description
   ```
   Use a descriptive, kebab-case name prefixed by type: `feat/`, `fix/`,
   `docs/`, `refactor/`, `chore/`.
3. **Make your change.** Keep commits focused; one logical change per PR is ideal.
4. **Write tests** under `tests/` following the `*.test.mjs` convention, and make
   sure they cover the new behavior.
5. **Run checks locally:**
   ```bash
   npm test
   npm run build
   ```
6. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add grok --effort flag
   fix: quote $ARGUMENTS in cancel command
   docs: clarify fork install steps
   ```
7. **Push** to your fork and **open a pull request** against `main`. Fill in the
   PR template (what, why, tests, type).
8. **CI runs automatically** (`npm test` + `npm run build`). All checks must be
   green before merge.
9. **Maintainer review.** The maintainer (repo owner) reviews and **approves**
   the PR. External PRs require at least one approval to merge.
10. **Merge.** Once approved and CI is green, the PR is merged into `main`.

### Branch protection details

- Direct pushes to `main` are blocked; a PR is required.
- At least **one review approval** is required to merge (external contributors).
- The **CI** status check is required.
- Force pushes and branch deletion are blocked.
- The maintainer (admin) may self-merge their own PRs (admin bypass) so the
  fork isn't blocked when working solo.

## Commit and PR Conventions

- **Commit messages:** Conventional Commits (`feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`). Keep the subject line ≤ 72 chars; add a body for the "why."
- **PR titles:** descriptive, matching the commit convention.
- **Scope:** one logical change per PR. Large changes should be split.
- **Changelog:** if your change is user-facing for the Codex or Grok plugin,
  update the relevant `plugins/<plugin>/CHANGELOG.md`.
- **Reference issues** in the PR description where applicable
  (`Closes #123`, `Refs #456`).

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](./LICENSE) that covers this project.
