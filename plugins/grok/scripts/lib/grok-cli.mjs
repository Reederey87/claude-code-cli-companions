import process from "node:process";

import { binaryAvailable, runProcess } from "./process.mjs";

export const CLI_DEFAULT_MODEL = null;

const READ_ONLY_ALLOWS = [
  "Read"
];

const SENSITIVE_PATH_PATTERNS = [
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
];

const READ_ONLY_SENSITIVE_DENIES = SENSITIVE_PATH_PATTERNS.flatMap((pattern) => [
  `Read(${pattern})`,
  `Grep(${pattern})`
]);

const READ_ONLY_DENIES = [
  "Edit",
  ...READ_ONLY_SENSITIVE_DENIES,
  "Bash(cat)",
  "Bash(cat *)",
  "Bash(env)",
  "Bash(env *)",
  "Bash(printenv)",
  "Bash(printenv *)",
  "Bash(rm *)",
  "Bash(mv *)",
  "Bash(cp *)",
  "Bash(touch *)",
  "Bash(mkdir *)",
  "Bash(git add *)",
  "Bash(git diff)",
  "Bash(git diff *)",
  "Bash(git branch *)",
  "Bash(git commit *)",
  "Bash(git reset *)",
  "Bash(git checkout *)",
  "Bash(git switch *)",
  "Bash(git show)",
  "Bash(git show *)"
];

const WRITE_SENSITIVE_DENIES = SENSITIVE_PATH_PATTERNS.map((pattern) => `Edit(${pattern})`);

const WRITE_DENIES = [
  ...READ_ONLY_DENIES.filter((rule) => rule !== "Edit"),
  ...WRITE_SENSITIVE_DENIES
];

function normalizedModel(value) {
  const model = String(value ?? "").trim();
  return model || null;
}

export function resolveModel(explicitModel, env = process.env) {
  return normalizedModel(explicitModel) ?? normalizedModel(env.CLAUDE_PLUGIN_OPTION_DEFAULT_MODEL) ?? CLI_DEFAULT_MODEL;
}

export function parseGrokOutput(stdout) {
  const rawOutput = String(stdout ?? "").trim();
  if (!rawOutput) {
    return { parsed: null, rawOutput: "", parseError: "Grok produced no stdout." };
  }
  try {
    return { parsed: JSON.parse(rawOutput), rawOutput, parseError: null };
  } catch (error) {
    return {
      parsed: null,
      rawOutput,
      parseError: error instanceof Error ? error.message : "Grok returned malformed JSON."
    };
  }
}

export function getGrokAvailability(cwd) {
  return binaryAvailable("grok", ["--no-auto-update", "version"], { cwd });
}

export async function getGrokInspect(cwd, options = {}) {
  return runProcess("grok", ["--cwd", cwd, "--no-auto-update", "inspect", "--json"], {
    cwd,
    env: options.env ?? process.env
  });
}

export function buildReadOnlyGrokArgs({ cwd, prompt, model, sessionId, resumeSessionId }) {
  const args = [
    "--cwd",
    cwd,
    "--no-auto-update",
    "-p",
    prompt,
    "--output-format",
    "json",
    "--sandbox",
    "read-only",
    "--permission-mode",
    "dontAsk"
  ];
  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }
  for (const rule of READ_ONLY_ALLOWS) {
    args.push("--allow", rule);
  }
  for (const rule of READ_ONLY_DENIES) {
    args.push("--deny", rule);
  }
  if (model) {
    args.push("--model", model);
  }
  return args;
}

export function buildWriteGrokArgs({ cwd, prompt, model, sessionId, resumeSessionId, alwaysApprove = false }) {
  const args = [
    "--cwd",
    cwd,
    "--no-auto-update",
    "-p",
    prompt,
    "--output-format",
    "json",
    "--sandbox",
    "workspace",
    "--permission-mode",
    "acceptEdits"
  ];
  if (resumeSessionId) {
    args.push("--resume", resumeSessionId);
  } else if (sessionId) {
    args.push("--session-id", sessionId);
  }
  for (const rule of READ_ONLY_ALLOWS) {
    args.push("--allow", rule);
  }
  for (const rule of WRITE_DENIES) {
    args.push("--deny", rule);
  }
  if (alwaysApprove) {
    args.push("--always-approve");
  }
  if (model) {
    args.push("--model", model);
  }
  return args;
}

export async function runReadOnlyGrok({
  cwd,
  prompt,
  model,
  sessionId,
  resumeSessionId,
  env = process.env,
  runProcessImpl = runProcess,
  onPid
}) {
  const resolvedModel = resolveModel(model, env);
  const result = await runProcessImpl(
    "grok",
    buildReadOnlyGrokArgs({ cwd, prompt, model: resolvedModel, sessionId, resumeSessionId }),
    {
      cwd,
      detached: true,
      onPid,
      env: {
        ...env,
        GROK_BUILD_COMPANION_ACTIVE: "1"
      }
    }
  );
  return {
    ...result,
    model: resolvedModel,
    output: parseGrokOutput(result.stdout)
  };
}

export async function runWriteGrok({
  cwd,
  prompt,
  model,
  sessionId,
  resumeSessionId,
  alwaysApprove = false,
  env = process.env,
  runProcessImpl = runProcess,
  onPid
}) {
  const resolvedModel = resolveModel(model, env);
  const result = await runProcessImpl(
    "grok",
    buildWriteGrokArgs({
      cwd,
      prompt,
      model: resolvedModel,
      sessionId,
      resumeSessionId,
      alwaysApprove
    }),
    {
      cwd,
      detached: true,
      onPid,
      env: {
        ...env,
        GROK_BUILD_COMPANION_ACTIVE: "1"
      }
    }
  );
  return {
    ...result,
    model: resolvedModel,
    output: parseGrokOutput(result.stdout)
  };
}
