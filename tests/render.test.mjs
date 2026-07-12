import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";

import { renderReviewResult, renderStoredJobResult } from "../plugins/codex/scripts/lib/render.mjs";
import { isProcessAlive } from "../plugins/grok/scripts/lib/process.mjs";
import {
  renderJobResult as renderGrokJobResult,
  renderStatus as renderGrokStatus
} from "../plugins/grok/scripts/lib/render.mjs";

function withRunningLiveness(job) {
  if (job.status !== "running") {
    return job;
  }
  if (typeof job.grokPid !== "number" || !Number.isFinite(job.grokPid)) {
    return { ...job, liveness: "unknown" };
  }
  return {
    ...job,
    liveness: isProcessAlive(job.grokPid) ? "alive" : "gone"
  };
}

test("renderReviewResult degrades gracefully when JSON is missing required review fields", () => {
  const output = renderReviewResult(
    {
      parsed: {
        verdict: "approve",
        summary: "Looks fine."
      },
      rawOutput: JSON.stringify({
        verdict: "approve",
        summary: "Looks fine."
      }),
      parseError: null
    },
    {
      reviewLabel: "Adversarial Review",
      targetLabel: "working tree diff"
    }
  );

  assert.match(output, /Codex returned JSON with an unexpected review shape\./);
  assert.match(output, /Missing array `findings`\./);
  assert.match(output, /Raw final message:/);
});

test("renderStoredJobResult prefers rendered output for structured review jobs", () => {
  const output = renderStoredJobResult(
    {
      id: "review-123",
      status: "completed",
      title: "Codex Adversarial Review",
      jobClass: "review",
      threadId: "thr_123"
    },
    {
      threadId: "thr_123",
      rendered: "# Codex Adversarial Review\n\nTarget: working tree diff\nVerdict: needs-attention\n",
      result: {
        result: {
          verdict: "needs-attention",
          summary: "One issue.",
          findings: [],
          next_steps: []
        },
        rawOutput:
          '{"verdict":"needs-attention","summary":"One issue.","findings":[],"next_steps":[]}'
      }
    }
  );

  assert.match(output, /^# Codex Adversarial Review/);
  assert.doesNotMatch(output, /^\{/);
  assert.match(output, /Codex session ID: thr_123/);
  assert.match(output, /Resume in Codex: codex resume thr_123/);
});

test("renderJobResult renders the incomplete banner and status legend", () => {
  const output = renderGrokJobResult({
    id: "grok-123",
    status: "incomplete",
    stopReason: "Cancelled",
    rendered: "# Grok Rescue\n\nPartial result.\n"
  });

  assert.match(output, /⚠ INCOMPLETE — Grok stopped early \(stopReason: Cancelled\)\./);
  assert.match(output, /Changes may be partial\. Verify against git status\/diff/);
  assert.match(output, /Statuses: succeeded = clean EndTurn; incomplete = early stop, verify diff;/);
});

test("displayJob renders an incomplete warning through the status report", () => {
  const output = renderGrokStatus([
    {
      id: "grok-123",
      kind: "task",
      status: "incomplete",
      stopReason: "Cancelled"
    }
  ]);

  assert.match(output, /  ⚠ stopped early \(stopReason: Cancelled\) — verify diff/);
});

test("an old-shaped Grok job record renders without new terminal evidence fields", () => {
  assert.doesNotThrow(() =>
    renderGrokJobResult({
      id: "grok-old",
      status: "succeeded",
      rendered: "# Grok\n\nLegacy result.\n"
    })
  );
});

test("running Grok job with live grokPid renders pid alive", () => {
  const job = withRunningLiveness({
    id: "grok-live",
    kind: "task",
    status: "running",
    grokPid: process.pid,
    startedAt: new Date(Date.now() - 12_000).toISOString()
  });
  const output = renderGrokStatus([job]);
  assert.match(output, /running \(pid alive, \d+s elapsed\)/);
});

test("running Grok job with exited grokPid renders pid-gone warning", () => {
  const child = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
    encoding: "utf8"
  });
  assert.ok(Number.isFinite(child.pid));
  assert.equal(isProcessAlive(child.pid), false);

  const job = withRunningLiveness({
    id: "grok-dead",
    kind: "task",
    status: "running",
    grokPid: child.pid,
    startedAt: new Date(Date.now() - 30_000).toISOString()
  });
  const output = renderGrokStatus([job]);
  assert.match(
    output,
    /⚠ running but pid gone — likely dead or externally cancelled; check \/grok:result/
  );
});

test("running Grok job without grokPid renders liveness unknown", () => {
  const job = withRunningLiveness({
    id: "grok-unknown",
    kind: "task",
    status: "running",
    grokPid: null,
    startedAt: new Date().toISOString()
  });
  const output = renderGrokStatus([job]);
  assert.match(output, /running \(liveness unknown\)/);
});

test("displayJob stays pure for old running records missing liveness fields", () => {
  assert.doesNotThrow(() => {
    const output = renderGrokStatus([
      {
        id: "grok-legacy-running",
        kind: "task",
        status: "running"
      }
    ]);
    assert.match(output, /running \(liveness unknown\)/);
  });
});
