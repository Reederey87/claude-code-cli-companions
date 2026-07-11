<!--
Thanks for opening a pull request! Please fill in the sections below.
Read CONTRIBUTING.md for the full workflow. Keep the PR focused on one
logical change. All checks (npm test + npm run build) must pass before merge.
-->

## Summary

<!-- One or two sentences: what does this PR do? -->

## Motivation

<!-- Why is this change needed? What problem does it solve? Link any related issue: Closes #123 / Refs #456 -->

## What changed

<!-- Bulleted list of the meaningful changes. Call out anything reviewers should look at closely. -->

-

## Change type

<!-- Check one. Use Conventional Commits in your commit messages (feat:, fix:, docs:, refactor:, chore:). -->

- [ ] `feat` — new capability
- [ ] `fix` — bug fix
- [ ] `refactor` — no behavior change
- [ ] `docs` — documentation only
- [ ] `chore` — tooling/packaging/ci
- [ ] `breaking` — breaking change (call it out below)

## Checklist

- [ ] Branch is named by type (e.g. `feat/...`, `fix/...`, `docs/...`).
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/).
- [ ] `npm test` passes locally.
- [ ] `npm run build` passes locally (requires `codex` CLI on PATH for the prebuild step).
- [ ] Tests added/updated for the new behavior (under `tests/`, `*.test.mjs`).
- [ ] No secrets, tokens, or credentials committed.
- [ ] Shell `!`-commands quote `"$ARGUMENTS"` (no unquoted user input).
- [ ] User-facing change? Updated the relevant `plugins/<plugin>/CHANGELOG.md`.

## Notes for reviewer

<!-- Anything the maintainer should know before approving. -->
