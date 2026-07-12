function formatElapsedSince(startValue) {
  const start = Date.parse(startValue ?? "");
  if (!Number.isFinite(start)) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round((Date.now() - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatRunningLivenessLine(job) {
  const liveness = job.liveness ?? "unknown";
  if (liveness === "alive") {
    const elapsed = formatElapsedSince(job.startedAt);
    return elapsed
      ? `  running (pid alive, ${elapsed} elapsed)`
      : "  running (pid alive)";
  }
  if (liveness === "gone") {
    return "  ⚠ running but pid gone — likely dead or externally cancelled; check /grok:result";
  }
  return "  running (liveness unknown)";
}

function displayJob(job) {
  const worktreePath = job.worktreeRoot ?? job.request?.cwd ?? null;
  const sharedRoot = job.workspaceRoot ?? null;
  const showWorktree =
    typeof worktreePath === "string" &&
    worktreePath &&
    typeof sharedRoot === "string" &&
    sharedRoot &&
    worktreePath !== sharedRoot;

  return [
    `- ${job.id} | ${job.kind} | ${job.status}`,
    job.summary ? `  ${job.summary}` : null,
    showWorktree ? `  worktree: ${worktreePath}` : null,
    job.pid ? `  PID: ${job.pid}` : null,
    job.status === "running" ? formatRunningLivenessLine(job) : null,
    job.errorMessage && job.status !== "incomplete" ? `  Error: ${job.errorMessage}` : null,
    job.status === "incomplete"
      ? `  ⚠ stopped early (stopReason: ${job.stopReason ?? "unknown"}) — verify diff`
      : null
  ]
    .filter(Boolean)
    .join("\n");
}

export function renderSetup(report) {
  const lines = [
    "# Grok Setup",
    "",
    `Status: ${report.ready ? "ready" : "needs attention"}`,
    "",
    "Checks:",
    `- node: ${report.node.detail}`,
    `- grok: ${report.grok.detail}`,
    `- inspect: ${report.inspect.detail}`,
    "- API fallback: configured but not implemented in this MVP"
  ];
  if (report.nextSteps.length > 0) {
    lines.push("", "Next steps:", ...report.nextSteps.map((step) => `- ${step}`));
  }
  return `${lines.join("\n")}\n`;
}

export function renderGrokResult(result, heading = "Grok") {
  const lines = [`# ${heading}`, ""];
  if (result.output.parsed !== null) {
    lines.push("```json", JSON.stringify(result.output.parsed, null, 2), "```");
  } else if (result.output.rawOutput) {
    lines.push(result.output.rawOutput);
  } else {
    lines.push("Grok completed without stdout output.");
  }
  if (result.stderr?.trim()) {
    lines.push("", "stderr:", "```text", result.stderr.trim(), "```");
  }
  if (result.output.parseError) {
    lines.push("", `JSON fallback: ${result.output.parseError}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderWriteSummary(writeSummary) {
  return [
    "Write summary:",
    ...(writeSummary.changedFiles.length > 0
      ? writeSummary.changedFiles.map((filePath) => `- ${filePath}`)
      : ["- No Git status changes detected (no edits landed)."])
  ];
}

export function renderIncompleteBanner(stopReason) {
  return [
    `⚠ INCOMPLETE — Grok stopped early (stopReason: ${stopReason ?? "unknown"}).`,
    "Changes may be partial. Verify against git status/diff before trusting any success narrative."
  ];
}

export function renderStatus(jobs) {
  const lines = ["# Grok Status", ""];
  if (jobs.length === 0) {
    lines.push("No jobs recorded for this workspace.");
  } else {
    lines.push(...jobs.map(displayJob));
  }
  return `${lines.join("\n")}\n`;
}

export function renderCleanupReport(payload) {
  const lines = ["# Grok Cleanup", ""];

  if (payload.attempted === 0) {
    lines.push("Nothing to clean up.");
    if (payload.preservedSessionId) {
      lines.push("", `Preserved for resume: ${payload.preservedSessionId}`);
    }
    return `${lines.join("\n").trimEnd()}\n`;
  }

  lines.push(`Attempted: ${payload.attempted}`, "");
  for (const result of payload.results) {
    lines.push(`- ${result.sessionId}: ${result.ok ? "ok" : `failed (${result.detail ?? "unknown error"})`}`);
  }

  if (payload.preservedSessionId) {
    lines.push("", `Preserved for resume: ${payload.preservedSessionId}`);
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderJobResult(job) {
  const lines = [
    `# Grok Result`,
    "",
    `Job: ${job.id}`,
    `Status: ${job.status}`
  ];
  if (job.status === "incomplete" && !job.rendered?.startsWith("⚠ INCOMPLETE")) {
    lines.push("", ...renderIncompleteBanner(job.stopReason));
  }
  lines.push("");
  if (job.rendered) {
    lines.push(job.rendered.trimEnd());
  } else if (job.errorMessage) {
    lines.push(job.errorMessage);
  } else {
    lines.push("No result payload was stored.");
  }
  if (job.writeSummary && !job.rendered) {
    lines.push("", ...renderWriteSummary(job.writeSummary));
  }
  if (job.status === "incomplete") {
    lines.push(
      "",
      "Statuses: succeeded = clean EndTurn; incomplete = early stop, verify diff; failed = crashed; cancelled = user-cancelled."
    );
  }
  return `${lines.join("\n")}\n`;
}
