#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

import { terminateProcessTree } from "./lib/process.mjs";
import { appendJobLog, compareAndSwapJobState, listJobs, releaseWriteLock } from "./lib/state.mjs";
import { resolveWorkspace } from "./lib/workspace.mjs";

export const SESSION_ID_ENV = "GROK_COMPANION_SESSION_ID";

function readHookInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function appendEnvVar(name, value) {
  if (!process.env.CLAUDE_ENV_FILE || value == null || value === "") {
    return;
  }
  fs.appendFileSync(process.env.CLAUDE_ENV_FILE, `export ${name}=${shellEscape(value)}\n`, "utf8");
}

function isActiveJob(job) {
  return job.status === "queued" || job.status === "running";
}

function cleanupSessionJobs(cwd, sessionId) {
  if (!sessionId) {
    return;
  }
  const workspaceRoot = resolveWorkspace(cwd);
  for (const job of listJobs(workspaceRoot)) {
    if (job.claudeSessionId !== sessionId || !isActiveJob(job)) {
      continue;
    }
    const result = compareAndSwapJobState(workspaceRoot, job.id, job.status, {
      ...job,
      status: "cancelled",
      pid: null,
      completedAt: new Date().toISOString(),
      errorMessage: "Cancelled because the Claude session ended."
    });
    if (!result.success) {
      continue;
    }
    try {
      terminateProcessTree(job.grokPid ?? job.pid ?? Number.NaN);
    } catch {
      // Best effort process cleanup during Claude session teardown.
    }
    if (job.request?.write) {
      releaseWriteLock(workspaceRoot, job.id);
    }
    appendJobLog(workspaceRoot, result.job.id, "Cancelled because the Claude session ended.");
  }
}

function main() {
  const input = readHookInput();
  const eventName = process.argv[2] ?? input.hook_event_name ?? "";
  if (eventName === "SessionStart") {
    appendEnvVar(SESSION_ID_ENV, input.session_id);
    return;
  }
  if (eventName === "SessionEnd") {
    cleanupSessionJobs(input.cwd || process.cwd(), input.session_id || process.env[SESSION_ID_ENV]);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
