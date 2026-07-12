import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installFakeGrok } from "./fake-grok-fixture.mjs";
import { initGitRepo, makeTempDir, run, writeExecutable } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPANION = path.join(ROOT, "plugins", "grok", "scripts", "grok-companion.mjs");
const SESSION_HOOK = path.join(ROOT, "plugins", "grok", "scripts", "session-lifecycle-hook.mjs");

function createEnvironment(options = {}) {
  const root = makeTempDir("grok-runtime-");
  const binDir = path.join(root, "bin");
  const workspace = path.join(root, "workspace");
  const pluginData = path.join(root, "plugin-data");
  fs.mkdirSync(binDir);
  fs.mkdirSync(workspace);
  const fake = options.installFake === false ? null : installFakeGrok(binDir, options.behavior);
  return {
    root,
    binDir,
    workspace,
    fake,
    env: {
      ...process.env,
      PATH: options.installFake === false ? binDir : `${binDir}${path.delimiter}${process.env.PATH}`,
      CLAUDE_PLUGIN_DATA: pluginData,
      ...(options.env ?? {})
    }
  };
}

function invoke(fixture, args, options = {}) {
  return run(process.execPath, [COMPANION, ...args], {
    cwd: options.cwd ?? fixture.workspace,
    env: { ...fixture.env, ...(options.env ?? {}) }
  });
}

function commit(cwd, message) {
  const result = run("git", ["add", "."], { cwd });
  assert.equal(result.status, 0, result.stderr);
  const committed = run("git", ["commit", "-m", message], { cwd });
  assert.equal(committed.status, 0, committed.stderr);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readJobs(fixture) {
  const jobsRoot = path.join(fixture.root, "plugin-data", "jobs");
  if (!fs.existsSync(jobsRoot)) {
    return [];
  }
  return fs.readdirSync(jobsRoot).flatMap((directory) =>
    fs
      .readdirSync(path.join(jobsRoot, directory))
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => JSON.parse(fs.readFileSync(path.join(jobsRoot, directory, entry), "utf8")))
  );
}

function installQueuedStateRaceHook(root) {
  const hookPath = path.join(root, "queued-state-race-hook.cjs");
  fs.writeFileSync(
    hookPath,
    `const fs = require("node:fs");
const originalRename = fs.renameSync;

if (!process.argv.includes("worker")) {
  let jsonWrites = 0;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  fs.renameSync = (from, to) => {
    if (String(to).endsWith(".json") && String(from).includes(".tmp")) {
      jsonWrites += 1;
      if (jsonWrites === 2) {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          try {
            if (JSON.parse(fs.readFileSync(to, "utf8")).status === "succeeded") {
              break;
            }
          } catch {
            // The worker may not have written the state file yet.
          }
          Atomics.wait(sleeper, 0, 0, 10);
        }
      }
    }
    return originalRename.call(fs, from, to);
  };
}
`,
    "utf8"
  );
  return `--require=${hookPath}`;
}

function installGitArgumentRecorder(binDir) {
  const gitPath = process.env.PATH.split(path.delimiter)
    .map((entry) => path.join(entry, "git"))
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(gitPath, "git must be available for Git context tests");

  const logPath = path.join(binDir, "git-arguments.jsonl");
  const scriptPath = path.join(binDir, "git");
  writeExecutable(
    scriptPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(process.argv.slice(2)) + "\\n");
const result = spawnSync(${JSON.stringify(gitPath)}, process.argv.slice(2), { stdio: "inherit" });
process.exit(result.status ?? 1);
`
  );
  return {
    env: { PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
    readArguments() {
      return fs
        .readFileSync(logPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  };
}

function assertDiffSafetyFlags(argumentLists) {
  const diffCalls = argumentLists.filter(([subcommand]) => subcommand === "diff");
  assert.ok(diffCalls.length > 0, "expected Git diff collection calls");
  for (const args of diffCalls) {
    assert.equal(args.includes("--no-ext-diff"), true);
    assert.equal(args.includes("--no-textconv"), true);
    assert.equal(args.includes("--no-renames"), true);
  }
}

test("setup reports a missing Grok CLI without attempting installation", () => {
  const fixture = createEnvironment({ installFake: false });
  const result = invoke(fixture, ["setup", "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, false);
  assert.equal(report.grok.available, false);
  assert.match(report.nextSteps.join("\n"), /Install Grok Build/i);
});

test("setup checks the local Grok CLI and inspect command", () => {
  const fixture = createEnvironment();
  const result = invoke(fixture, ["setup", "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ready, true);
  assert.equal(report.grok.available, true);
  assert.equal(report.inspect.available, true);
  const inspectCall = fixture.fake.readState().calls.find((call) => call.args.includes("inspect"));
  assert.ok(inspectCall, "expected an inspect invocation to be recorded");
  assert.equal(inspectCall.args.includes("--no-auto-update"), true);
});

test("ask forwards model selection with explicit, configured, then CLI-default precedence", () => {
  const fixture = createEnvironment();
  const explicit = invoke(fixture, ["ask", "--model", "explicit-model", "explain", "this", "--json"]);
  assert.equal(explicit.status, 0, explicit.stderr);

  const configured = invoke(fixture, ["ask", "explain", "this", "--json"], {
    env: { CLAUDE_PLUGIN_OPTION_DEFAULT_MODEL: "configured-model" }
  });
  assert.equal(configured.status, 0, configured.stderr);

  const defaulted = invoke(fixture, ["ask", "explain", "this", "--json"], {
    env: { CLAUDE_PLUGIN_OPTION_DEFAULT_MODEL: "" }
  });
  assert.equal(defaulted.status, 0, defaulted.stderr);

  const calls = fixture.fake.readState().calls;
  assert.equal(calls.length, 3);
  assert.equal(calls[0].args[calls[0].args.indexOf("--model") + 1], "explicit-model");
  assert.equal(calls[1].args[calls[1].args.indexOf("--model") + 1], "configured-model");
  assert.equal(calls[2].args.includes("--model"), false);
});

test("ask forwards explicit effort, max-turns, and json-schema flags to Grok", () => {
  const fixture = createEnvironment();
  const schema = '{"type":"object"}';
  const result = invoke(fixture, [
    "ask",
    "--effort",
    "high",
    "--max-turns",
    "25",
    "--json-schema",
    schema,
    "explain",
    "this",
    "--json"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const call = fixture.fake.readState().calls[0];
  assert.equal(call.args[call.args.indexOf("--effort") + 1], "high");
  assert.equal(call.args[call.args.indexOf("--max-turns") + 1], "25");
  assert.equal(call.args[call.args.indexOf("--json-schema") + 1], schema);
});

test("a default run omits effort, max-turns, and json-schema flags", () => {
  const fixture = createEnvironment();
  const result = invoke(fixture, ["ask", "explain", "this", "--json"], {
    env: { CLAUDE_PLUGIN_OPTION_DEFAULT_EFFORT: "", CLAUDE_PLUGIN_OPTION_DEFAULT_MAX_TURNS: "" }
  });

  assert.equal(result.status, 0, result.stderr);
  const call = fixture.fake.readState().calls[0];
  assert.equal(call.args.includes("--effort"), false);
  assert.equal(call.args.includes("--max-turns"), false);
  assert.equal(call.args.includes("--json-schema"), false);
});

test("effort and max-turns fall back to env defaults, and an explicit flag wins", () => {
  const fixture = createEnvironment();
  const envDefaults = { CLAUDE_PLUGIN_OPTION_DEFAULT_EFFORT: "low", CLAUDE_PLUGIN_OPTION_DEFAULT_MAX_TURNS: "10" };

  const defaulted = invoke(fixture, ["ask", "explain", "this", "--json"], { env: envDefaults });
  assert.equal(defaulted.status, 0, defaulted.stderr);

  const overridden = invoke(
    fixture,
    ["ask", "--effort", "high", "--max-turns", "25", "explain", "this", "--json"],
    { env: envDefaults }
  );
  assert.equal(overridden.status, 0, overridden.stderr);

  const calls = fixture.fake.readState().calls;
  assert.equal(calls[0].args[calls[0].args.indexOf("--effort") + 1], "low");
  assert.equal(calls[0].args[calls[0].args.indexOf("--max-turns") + 1], "10");
  assert.equal(calls[1].args[calls[1].args.indexOf("--effort") + 1], "high");
  assert.equal(calls[1].args[calls[1].args.indexOf("--max-turns") + 1], "25");
});

test("an invalid --max-turns value is rejected before Grok is invoked", () => {
  const fixture = createEnvironment();
  const result = invoke(fixture, ["ask", "--max-turns", "abc", "explain", "this"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--max-turns must be a positive integer\./);
  assert.equal(fixture.fake.readState().calls.length, 0);
});

test("read-only commands use Grok sandbox, permission mode, explicit allows, and mutation denies", () => {
  const fixture = createEnvironment();
  const sourceFile = path.join(fixture.workspace, "source.txt");
  fs.writeFileSync(sourceFile, "original\n", "utf8");
  const result = invoke(fixture, ["ask", "explain", "source.txt", "--json"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(sourceFile, "utf8"), "original\n");
  const call = fixture.fake.readState().calls[0];
  assert.equal(call.cwd, fs.realpathSync.native(fixture.workspace));
  assert.equal(call.active, "1");
  assert.deepEqual(call.args.slice(0, 9), [
    "--cwd",
    fs.realpathSync.native(fixture.workspace),
    "--no-auto-update",
    "-p",
    call.args[4],
    "--output-format",
    "json",
    "--sandbox",
    "read-only"
  ]);
  assert.equal(call.args[call.args.indexOf("--permission-mode") + 1], "dontAsk");
  const allows = call.args.flatMap((argument, index) => (argument === "--allow" ? [call.args[index + 1]] : []));
  const denies = call.args.flatMap((argument, index) => (argument === "--deny" ? [call.args[index + 1]] : []));
  assert.equal(allows.includes("Read"), true);
  assert.equal(allows.includes("Glob"), false);
  assert.equal(allows.includes("Grep"), false);
  assert.equal(allows.includes("Bash(git:*)"), false);
  assert.equal(allows.includes("Bash(git *)"), false);
  assert.deepEqual(allows.filter((rule) => rule.startsWith("Bash(")), []);
  assert.equal(denies.includes("Edit"), true);
  for (const pattern of [
    ".*",
    ".*/**",
    "**/.*",
    "**/.*/**",
    ".npmrc",
    "**/.npmrc",
    ".netrc",
    "**/.netrc",
    "credentials*",
    "**/credentials*",
    "*credential*",
    "**/*credential*",
    "*secret*",
    "**/*secret*",
    "*token*",
    "**/*token*",
    "*password*",
    "**/*password*",
    "*private*",
    "**/*private*",
    "id_rsa",
    "id_rsa*",
    "**/id_rsa",
    "**/id_rsa*",
    "*.pem",
    "**/*.pem",
    "*.key",
    "**/*.key"
  ]) {
    assert.equal(denies.includes(`Read(${pattern})`), true);
    assert.equal(denies.includes(`Grep(${pattern})`), true);
  }
  assert.equal(denies.includes("Bash(git diff)"), true);
  assert.equal(denies.includes("Bash(git diff *)"), true);
  assert.equal(denies.includes("Bash(git show)"), true);
  assert.equal(denies.includes("Bash(git show *)"), true);
  assert.equal(denies.includes("Bash(git commit *)"), true);
  assert.equal(denies.includes("Bash(git reset *)"), true);
  assert.equal(denies.includes("Bash(git checkout *)"), true);
  assert.equal(denies.includes("Bash(git switch *)"), true);
  assert.equal(call.args.includes("--no-auto-update"), true);
  assert.match(call.args[call.args.indexOf("-p") + 1], /Do not create, edit, delete/i);
});

test("malformed Grok JSON is preserved as raw output", () => {
  const fixture = createEnvironment({ behavior: "malformed-json" });
  const result = invoke(fixture, ["ask", "return", "a", "summary", "--json"]);

  assert.equal(result.status, 2, result.stderr);
  const job = JSON.parse(result.stdout);
  assert.equal(job.status, "incomplete");
  assert.equal(job.result.grok.parsed, null);
  assert.equal(job.result.grok.rawOutput, "not valid json");
  assert.match(job.result.grok.parseError, /Unexpected token/i);
  assert.match(job.rendered, /INCOMPLETE/);
});

test("cancelled task jobs are incomplete and use the distinct foreground exit code", () => {
  const fixture = createEnvironment({ behavior: "cancelled" });
  const result = invoke(fixture, ["task", "--fresh", "attempt", "the", "task", "--json"]);

  assert.equal(result.status, 2, result.stderr);
  const job = JSON.parse(result.stdout);
  assert.equal(job.status, "incomplete");
  assert.equal(job.evidence.stopReason, "Cancelled");
  assert.equal(job.stopReason, "Cancelled");
  assert.match(job.rendered, /INCOMPLETE/);
});

test("cancelled write jobs preserve incomplete edits and render their changed files", () => {
  const fixture = createEnvironment({ behavior: "cancelled-with-edits" });
  initGitRepo(fixture.workspace);
  const result = invoke(fixture, [
    "task",
    "--fresh",
    "--write",
    "--always-approve",
    "attempt",
    "the",
    "task",
    "--json"
  ]);

  assert.equal(result.status, 2, result.stderr);
  const job = JSON.parse(result.stdout);
  assert.equal(job.status, "incomplete");
  assert.equal(job.writeSummary.changedFiles.includes("grok-write.txt"), true);
  assert.match(job.rendered, /INCOMPLETE/);
  assert.match(job.rendered, /grok-write\.txt/);
});

test("max-turns exhaustion is incomplete despite Grok exiting 1", () => {
  const fixture = createEnvironment({ behavior: "max-turns" });
  const result = invoke(fixture, ["task", "--fresh", "attempt", "the", "task", "--json"]);

  assert.equal(result.status, 2, result.stderr);
  const job = JSON.parse(result.stdout);
  assert.equal(job.status, "incomplete");
  assert.equal(job.evidence.exitStatus, 1);
  assert.equal(job.evidence.stopReason, "Cancelled");
});

test("a Grok crash without JSON remains failed", () => {
  const fixture = createEnvironment({ behavior: "failure" });
  const result = invoke(fixture, ["task", "--fresh", "attempt", "the", "task", "--json"]);

  assert.equal(result.status, 1, result.stderr);
  const job = JSON.parse(result.stdout);
  assert.equal(job.status, "failed");
  assert.equal(job.evidence.stopReason, null);
  assert.equal(job.evidence.exitStatus, 3);
});

test("a clean write job with no changes succeeds and explains that no edits landed", () => {
  const fixture = createEnvironment();
  initGitRepo(fixture.workspace);
  const result = invoke(fixture, [
    "task",
    "--fresh",
    "--write",
    "--always-approve",
    "inspect",
    "without",
    "editing",
    "--json"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const job = JSON.parse(result.stdout);
  assert.equal(job.status, "succeeded");
  assert.match(job.rendered, /No Git status changes detected \(no edits landed\)/);
});

test("review gathers bounded working-tree and base-branch context without untracked contents", () => {
  const fixture = createEnvironment();
  initGitRepo(fixture.workspace);
  fs.writeFileSync(path.join(fixture.workspace, "tracked.txt"), "base\n", "utf8");
  commit(fixture.workspace, "base");

  fs.writeFileSync(path.join(fixture.workspace, "tracked.txt"), "working change\n", "utf8");
  fs.writeFileSync(path.join(fixture.workspace, "visible.txt"), "do not inline untracked contents\n", "utf8");
  fs.writeFileSync(path.join(fixture.workspace, ".env"), "SECRET_DO_NOT_LEAK\n", "utf8");
  const workingTree = invoke(fixture, ["review", "--scope", "working-tree", "--json"]);
  assert.equal(workingTree.status, 0, workingTree.stderr);

  let prompt = fixture.fake.readState().calls[0].args[fixture.fake.readState().calls[0].args.indexOf("-p") + 1];
  assert.match(prompt, /Working tree changes/i);
  assert.match(prompt, /working change/);
  assert.match(prompt, /visible\.txt: file, \d+ bytes/);
  assert.doesNotMatch(prompt, /do not inline untracked contents/);
  assert.doesNotMatch(prompt, /SECRET_DO_NOT_LEAK/);

  run("git", ["switch", "-c", "feature"], { cwd: fixture.workspace });
  fs.writeFileSync(path.join(fixture.workspace, "branch.txt"), "branch change\n", "utf8");
  commit(fixture.workspace, "branch change");
  const branch = invoke(fixture, ["review", "--base", "main", "--json"]);
  assert.equal(branch.status, 0, branch.stderr);

  const secondCall = fixture.fake.readState().calls[1];
  prompt = secondCall.args[secondCall.args.indexOf("-p") + 1];
  assert.match(prompt, /Branch comparison: main\.\.\.HEAD/);
  assert.match(prompt, /branch change/);
});

test("review Git collection disables external conversions and excludes renamed sensitive files", () => {
  const workingTreeFixture = createEnvironment();
  const workingTreeGit = installGitArgumentRecorder(workingTreeFixture.binDir);
  initGitRepo(workingTreeFixture.workspace);
  fs.writeFileSync(path.join(workingTreeFixture.workspace, ".env"), "RENAMED_SECRET_WORKING\n", "utf8");
  fs.writeFileSync(path.join(workingTreeFixture.workspace, "safe.txt"), "base\n", "utf8");
  commit(workingTreeFixture.workspace, "base");
  fs.renameSync(
    path.join(workingTreeFixture.workspace, ".env"),
    path.join(workingTreeFixture.workspace, "moved.txt")
  );
  fs.writeFileSync(path.join(workingTreeFixture.workspace, "safe.txt"), "working update\n", "utf8");

  const workingTree = invoke(workingTreeFixture, ["review", "--scope", "working-tree", "--json"], {
    env: workingTreeGit.env
  });
  assert.equal(workingTree.status, 0, workingTree.stderr);
  const workingTreePrompt = workingTreeFixture.fake.readState().calls[0].args[
    workingTreeFixture.fake.readState().calls[0].args.indexOf("-p") + 1
  ];
  assert.match(workingTreePrompt, /working update/);
  assert.doesNotMatch(workingTreePrompt, /RENAMED_SECRET_WORKING|\.env/);
  assertDiffSafetyFlags(workingTreeGit.readArguments());

  const branchFixture = createEnvironment();
  const branchGit = installGitArgumentRecorder(branchFixture.binDir);
  initGitRepo(branchFixture.workspace);
  fs.writeFileSync(path.join(branchFixture.workspace, ".env"), "RENAMED_SECRET_BRANCH\n", "utf8");
  fs.writeFileSync(path.join(branchFixture.workspace, "safe.txt"), "base\n", "utf8");
  commit(branchFixture.workspace, "base");
  run("git", ["switch", "-c", "feature"], { cwd: branchFixture.workspace });
  fs.renameSync(path.join(branchFixture.workspace, ".env"), path.join(branchFixture.workspace, "moved.txt"));
  fs.writeFileSync(path.join(branchFixture.workspace, "safe.txt"), "branch update\n", "utf8");
  commit(branchFixture.workspace, "rename sensitive file");

  const branch = invoke(branchFixture, ["review", "--base", "main", "--json"], { env: branchGit.env });
  assert.equal(branch.status, 0, branch.stderr);
  const branchPrompt = branchFixture.fake.readState().calls[0].args[
    branchFixture.fake.readState().calls[0].args.indexOf("-p") + 1
  ];
  assert.match(branchPrompt, /branch update/);
  assert.doesNotMatch(branchPrompt, /RENAMED_SECRET_BRANCH|\.env/);
  const branchGitArgs = branchGit.readArguments();
  assertDiffSafetyFlags(branchGitArgs);
  assert.equal(branchGitArgs.some((args) => args[0] === "diff" && args.includes("--stat")), true);
});

test("background jobs persist a queued record and status/result retrieve scoped output", async () => {
  const fixture = createEnvironment({ behavior: "delayed" });
  const launch = invoke(fixture, ["task", "--background", "diagnose", "the", "issue", "--json"]);

  assert.equal(launch.status, 0, launch.stderr);
  const queued = JSON.parse(launch.stdout);
  assert.equal(queued.status, "queued");
  assert.ok(queued.pid);
  const jobsRoot = path.join(fixture.root, "plugin-data", "jobs");
  assert.equal(fs.readdirSync(jobsRoot).length, 1);
  assert.equal(fs.existsSync(path.join(ROOT, "plugins", "grok", "jobs")), false);

  const initialStatus = invoke(fixture, ["status", queued.jobId, "--json"]);
  assert.equal(initialStatus.status, 0, initialStatus.stderr);
  assert.ok(["queued", "running", "succeeded"].includes(JSON.parse(initialStatus.stdout).status));

  await sleep(500);
  const result = invoke(fixture, ["result", queued.jobId, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const completed = JSON.parse(result.stdout);
  assert.equal(completed.status, "succeeded");
  assert.equal(completed.result.grok.parsed.text, "fake response");
  assert.match(completed.rendered, /Grok Rescue/);
});

test("completed background work cannot be overwritten as queued by the launcher", async () => {
  const fixture = createEnvironment();
  const launch = invoke(fixture, ["task", "--background", "diagnose", "the", "issue", "--json"], {
    env: { NODE_OPTIONS: installQueuedStateRaceHook(fixture.root) }
  });

  assert.equal(launch.status, 0, launch.stderr);
  const queued = JSON.parse(launch.stdout);
  assert.equal(queued.status, "queued");

  await sleep(500);
  const status = invoke(fixture, ["status", queued.jobId, "--json"]);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).status, "succeeded");
});

test("ask and review reject write-capable flags while task supports write mode", () => {
  const fixture = createEnvironment();
  initGitRepo(fixture.workspace);
  for (const [command, flag] of [
    ["ask", "--write"],
    ["ask", "--always-approve"],
    ["review", "--yolo"]
  ]) {
    const result = invoke(fixture, [command, flag, "fix", "the", "bug"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /strictly read-only/i);
  }
  assert.equal(fixture.fake.readState().calls.length, 0);
});

test("fresh task sessions are persisted and resumed through Grok CLI session flags", () => {
  const fixture = createEnvironment();
  const sessionEnv = { GROK_COMPANION_SESSION_ID: "claude-session" };
  const fresh = invoke(fixture, ["task", "--fresh", "inspect", "the", "failure", "--json"], { env: sessionEnv });

  assert.equal(fresh.status, 0, fresh.stderr);
  const freshJob = JSON.parse(fresh.stdout);
  assert.equal(freshJob.claudeSessionId, "claude-session");
  assert.match(freshJob.grokSessionId, /^[0-9a-f-]{36}$/i);
  const firstCall = fixture.fake.readState().calls[0];
  assert.equal(firstCall.args[firstCall.args.indexOf("--session-id") + 1], freshJob.grokSessionId);
  assert.equal(firstCall.args.includes("--resume"), false);

  const resumed = invoke(fixture, ["task", "--resume", "continue", "the", "work", "--json"], { env: sessionEnv });
  assert.equal(resumed.status, 0, resumed.stderr);
  const resumedJob = JSON.parse(resumed.stdout);
  const secondCall = fixture.fake.readState().calls[1];
  assert.equal(secondCall.args[secondCall.args.indexOf("--resume") + 1], freshJob.grokSessionId);
  assert.equal(secondCall.args.includes("--session-id"), false);
  assert.equal(resumedJob.grokSessionId, freshJob.grokSessionId);
});

test("task --wait executes in the foreground", () => {
  const fixture = createEnvironment();
  const result = invoke(fixture, ["task", "--wait", "inspect", "the", "failure", "--json"]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "succeeded");
  assert.equal(fixture.fake.readState().calls.length, 1);
});

test("task forwards explicit effort, max-turns, and json-schema flags to Grok", () => {
  const fixture = createEnvironment();
  const schema = '{"type":"object"}';
  const result = invoke(fixture, [
    "task",
    "--wait",
    "--effort",
    "medium",
    "--max-turns",
    "5",
    "--json-schema",
    schema,
    "inspect",
    "the",
    "failure",
    "--json"
  ]);

  assert.equal(result.status, 0, result.stderr);
  const call = fixture.fake.readState().calls[0];
  assert.equal(call.args[call.args.indexOf("--effort") + 1], "medium");
  assert.equal(call.args[call.args.indexOf("--max-turns") + 1], "5");
  assert.equal(call.args[call.args.indexOf("--json-schema") + 1], schema);
});

test("resume candidates, implicit status, and implicit results are scoped to the Claude session", () => {
  const fixture = createEnvironment();
  const current = { GROK_COMPANION_SESSION_ID: "claude-current" };
  const other = { GROK_COMPANION_SESSION_ID: "claude-other" };

  const currentRun = invoke(fixture, ["task", "--fresh", "current", "task", "--json"], { env: current });
  const otherRun = invoke(fixture, ["task", "--fresh", "other", "task", "--json"], { env: other });
  assert.equal(currentRun.status, 0, currentRun.stderr);
  assert.equal(otherRun.status, 0, otherRun.stderr);
  const currentJob = JSON.parse(currentRun.stdout);
  const otherJob = JSON.parse(otherRun.stdout);

  const candidate = invoke(fixture, ["task-resume-candidate", "--json"], { env: current });
  assert.equal(candidate.status, 0, candidate.stderr);
  assert.equal(JSON.parse(candidate.stdout).candidate.id, currentJob.id);

  const status = invoke(fixture, ["status", "--json"], { env: current });
  assert.equal(status.status, 0, status.stderr);
  assert.deepEqual(JSON.parse(status.stdout).map((job) => job.id), [currentJob.id]);

  const result = invoke(fixture, ["result", "--json"], { env: current });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).id, currentJob.id);

  const explicit = invoke(fixture, ["result", otherJob.id, "--json"], { env: current });
  assert.equal(explicit.status, 0, explicit.stderr);
  assert.equal(JSON.parse(explicit.stdout).id, otherJob.id);
});

test("write tasks require Git, use documented workspace permissions, and persist touched paths", () => {
  const fixture = createEnvironment({ behavior: "write" });
  const notGit = invoke(fixture, ["task", "--write", "--always-approve", "apply", "the", "plan"]);
  assert.notEqual(notGit.status, 0);
  assert.match(notGit.stderr, /Git repository/i);

  initGitRepo(fixture.workspace);
  const result = invoke(fixture, ["task", "--write", "--always-approve", "apply", "the", "plan", "--json"]);
  assert.equal(result.status, 0, result.stderr);
  const job = JSON.parse(result.stdout);
  const call = fixture.fake.readState().calls[0];
  assert.equal(call.args[call.args.indexOf("--sandbox") + 1], "workspace");
  assert.equal(call.args[call.args.indexOf("--permission-mode") + 1], "acceptEdits");
  assert.equal(call.args.includes("--always-approve"), true);
  assert.equal(call.args.includes("--no-auto-update"), true);
  const denies = call.args.flatMap((argument, index) => (argument === "--deny" ? [call.args[index + 1]] : []));
  assert.equal(denies.includes("Read(**/*secret*)"), true);
  assert.equal(denies.includes("Grep(**/*secret*)"), true);
  assert.equal(denies.includes("Edit(**/*secret*)"), true);
  assert.equal(denies.includes("Bash(git reset *)"), true);
  assert.equal(denies.includes("Bash(git checkout *)"), true);
  assert.equal(job.writeSummary.changedFiles.includes("grok-write.txt"), true);
  assert.match(job.rendered, /Write summary:[\s\S]*grok-write\.txt/);
  assert.equal(fs.existsSync(path.join(fixture.workspace, "grok-write.txt")), true);
});

test("background write tasks require explicit approval and hold a per-workspace lock", async () => {
  const fixture = createEnvironment({ behavior: "delayed-write" });
  initGitRepo(fixture.workspace);

  const rejected = invoke(fixture, ["task", "--write", "--background", "apply", "the", "plan"]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Write tasks require explicit --always-approve/i);

  const launch = invoke(fixture, ["task", "--write", "--background", "--yolo", "apply", "the", "plan", "--json"]);
  assert.equal(launch.status, 0, launch.stderr);
  const launched = JSON.parse(launch.stdout);
  const second = invoke(fixture, ["task", "--write", "--always-approve", "apply", "another", "plan"]);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /already active/i);

  await sleep(50);
  const call = fixture.fake.readState().calls[0];
  assert.equal(call.args.includes("--always-approve"), true);
  const jobs = readJobs(fixture);
  assert.equal(jobs.some((job) => job.id === launched.jobId && ["queued", "running"].includes(job.status)), true);
});

test("foreground write tasks without --always-approve are rejected", () => {
  const fixture = createEnvironment({ behavior: "write" });
  initGitRepo(fixture.workspace);
  const rejected = invoke(fixture, ["task", "--write", "apply", "the", "plan"]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Write tasks require explicit --always-approve/i);
  assert.equal(fixture.fake.readState().calls.length, 0);
});

test("stale write lock is reclaimed when the owning job is terminal", () => {
  const fixture = createEnvironment({ behavior: "write" });
  initGitRepo(fixture.workspace);

  const first = invoke(fixture, ["task", "--write", "--always-approve", "apply", "the", "plan", "--json"]);
  assert.equal(first.status, 0, first.stderr);
  const firstJob = JSON.parse(first.stdout);
  assert.equal(firstJob.status, "succeeded");

  const jobsRoot = path.join(fixture.root, "plugin-data", "jobs");
  const hashDir = fs.readdirSync(jobsRoot).find((entry) =>
    fs.statSync(path.join(jobsRoot, entry)).isDirectory()
  );
  assert.ok(hashDir, "expected a per-workspace job directory");
  const lockDir = path.join(jobsRoot, hashDir, "write.lock");
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, "owner.json"),
    `${JSON.stringify({ jobId: firstJob.id, pid: 99999 })}\n`,
    "utf8"
  );

  const second = invoke(fixture, ["task", "--write", "--always-approve", "apply", "another", "plan", "--json"]);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(JSON.parse(second.stdout).status, "succeeded");
});

test("session lifecycle exports the Grok session id and cancels only matching active jobs", async () => {
  const fixture = createEnvironment({ behavior: "delayed" });
  initGitRepo(fixture.workspace);
  const envFile = path.join(fixture.root, "claude-env.sh");
  fs.writeFileSync(envFile, "", "utf8");

  const started = run(process.execPath, [SESSION_HOOK, "SessionStart"], {
    cwd: fixture.workspace,
    env: { ...fixture.env, CLAUDE_ENV_FILE: envFile },
    input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "claude-current" })
  });
  assert.equal(started.status, 0, started.stderr);
  assert.equal(fs.readFileSync(envFile, "utf8"), "export GROK_COMPANION_SESSION_ID='claude-current'\n");

  const currentLaunch = invoke(fixture, ["task", "--background", "current", "work", "--json"], {
    env: { GROK_COMPANION_SESSION_ID: "claude-current" }
  });
  const otherLaunch = invoke(fixture, ["task", "--background", "other", "work", "--json"], {
    env: { GROK_COMPANION_SESSION_ID: "claude-other" }
  });
  assert.equal(currentLaunch.status, 0, currentLaunch.stderr);
  assert.equal(otherLaunch.status, 0, otherLaunch.stderr);

  const cleanup = run(process.execPath, [SESSION_HOOK, "SessionEnd"], {
    cwd: fixture.workspace,
    env: { ...fixture.env, GROK_COMPANION_SESSION_ID: "claude-current" },
    input: JSON.stringify({
      hook_event_name: "SessionEnd",
      session_id: "claude-current",
      cwd: fixture.workspace
    })
  });
  assert.equal(cleanup.status, 0, cleanup.stderr);

  const currentJobId = JSON.parse(currentLaunch.stdout).jobId;
  const otherJobId = JSON.parse(otherLaunch.stdout).jobId;
  const jobs = readJobs(fixture);
  assert.equal(jobs.find((job) => job.id === currentJobId).status, "cancelled");
  assert.notEqual(jobs.find((job) => job.id === otherJobId).status, "cancelled");
  await sleep(500);
});

test("cancel stops an active background job and marks it cancelled", async () => {
  const fixture = createEnvironment({ behavior: "delayed" });
  initGitRepo(fixture.workspace);
  const launch = invoke(fixture, ["task", "--background", "diagnose", "the", "issue", "--json"]);
  assert.equal(launch.status, 0, launch.stderr);
  const queued = JSON.parse(launch.stdout);

  const cancelResult = invoke(fixture, ["cancel", queued.jobId, "--json"]);
  assert.equal(cancelResult.status, 0, cancelResult.stderr);
  const cancelled = JSON.parse(cancelResult.stdout);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.jobId, queued.jobId);

  const statusResult = invoke(fixture, ["status", queued.jobId, "--json"]);
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const jobStatus = JSON.parse(statusResult.stdout);
  assert.equal(jobStatus.status, "cancelled");

  await sleep(500);
  const finalJobs = readJobs(fixture);
  const finalJob = finalJobs.find((job) => job.id === queued.jobId);
  assert.equal(finalJob.status, "cancelled");
});

test("cancel without a job-id targets the latest active job in the current session", async () => {
  const fixture = createEnvironment({ behavior: "delayed" });
  initGitRepo(fixture.workspace);
  const sessionEnv = { GROK_COMPANION_SESSION_ID: "claude-session" };
  const launch = invoke(fixture, ["task", "--background", "diagnose", "the", "issue", "--json"], { env: sessionEnv });
  assert.equal(launch.status, 0, launch.stderr);
  const queued = JSON.parse(launch.stdout);

  const cancelResult = invoke(fixture, ["cancel", "--json"], { env: sessionEnv });
  assert.equal(cancelResult.status, 0, cancelResult.stderr);
  const cancelled = JSON.parse(cancelResult.stdout);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.jobId, queued.jobId);

  await sleep(500);
});

test("cancel with an explicit job-id can target a job from another session", async () => {
  const fixture = createEnvironment({ behavior: "delayed" });
  initGitRepo(fixture.workspace);
  const launch = invoke(fixture, ["task", "--background", "diagnose", "the", "issue", "--json"], {
    env: { GROK_COMPANION_SESSION_ID: "session-a" }
  });
  assert.equal(launch.status, 0, launch.stderr);
  const queued = JSON.parse(launch.stdout);

  const cancelResult = invoke(fixture, ["cancel", queued.jobId, "--json"], {
    env: { GROK_COMPANION_SESSION_ID: "session-b" }
  });
  assert.equal(cancelResult.status, 0, cancelResult.stderr);
  const cancelled = JSON.parse(cancelResult.stdout);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.jobId, queued.jobId);

  await sleep(500);
});

test("cancel reports an error when no active job exists", () => {
  const fixture = createEnvironment();
  initGitRepo(fixture.workspace);
  const result = invoke(fixture, ["cancel", "--json"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /No active Grok job/i);
});

test("cancel does not resurrect a completed job", async () => {
  const fixture = createEnvironment();
  initGitRepo(fixture.workspace);
  const launch = invoke(fixture, ["task", "--background", "diagnose", "the", "issue", "--json"]);
  assert.equal(launch.status, 0, launch.stderr);
  const queued = JSON.parse(launch.stdout);

  await sleep(500);
  const cancelResult = invoke(fixture, ["cancel", queued.jobId, "--json"]);
  assert.notEqual(cancelResult.status, 0);
  assert.match(cancelResult.stderr, /already succeeded|already|not active/i);
});

test("cleanup deletes terminal task sessions while preserving the newest resumable session", () => {
  const fixture = createEnvironment();
  const first = invoke(fixture, ["task", "--fresh", "first", "task", "--json"]);
  const second = invoke(fixture, ["task", "--fresh", "second", "task", "--json"]);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const firstJob = JSON.parse(first.stdout);
  const secondJob = JSON.parse(second.stdout);

  const cleanupResult = invoke(fixture, ["cleanup", "--json"]);
  assert.equal(cleanupResult.status, 0, cleanupResult.stderr);
  const payload = JSON.parse(cleanupResult.stdout);
  assert.equal(payload.preservedSessionId, secondJob.grokSessionId);
  assert.deepEqual(payload.results.map((entry) => entry.sessionId), [firstJob.grokSessionId]);
  assert.equal(payload.results[0].ok, true);

  const sessionsDeleteCalls = fixture.fake
    .readState()
    .calls.filter((call) => call.args.includes("sessions") && call.args.includes("delete"));
  assert.deepEqual(
    sessionsDeleteCalls.map((call) => call.args[call.args.length - 1]),
    [firstJob.grokSessionId]
  );
});

test("cleanup reports session deletion failures but still exits 0", () => {
  const fixture = createEnvironment({ behavior: "failure" });
  const first = invoke(fixture, ["task", "--fresh", "first", "task", "--json"]);
  const second = invoke(fixture, ["task", "--fresh", "second", "task", "--json"]);
  const firstJob = JSON.parse(first.stdout);
  const secondJob = JSON.parse(second.stdout);

  const cleanupResult = invoke(fixture, ["cleanup", "--json"]);
  assert.equal(cleanupResult.status, 0, cleanupResult.stderr);
  const payload = JSON.parse(cleanupResult.stdout);
  assert.equal(payload.preservedSessionId, secondJob.grokSessionId);
  assert.equal(payload.attempted, 1);
  assert.equal(payload.results[0].sessionId, firstJob.grokSessionId);
  assert.equal(payload.results[0].ok, false);
  assert.equal(typeof payload.results[0].detail, "string");
});

test("cleanup reports nothing to clean up when no terminal task sessions exist", () => {
  const fixture = createEnvironment();
  const result = invoke(fixture, ["cleanup"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Nothing to clean up\./);
});
