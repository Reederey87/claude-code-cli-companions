import fs from "node:fs";
import path from "node:path";

import { runCommand } from "./process.mjs";

export function canonicalDirectory(cwd) {
  const resolved = path.resolve(cwd);
  let stat;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error(`Working directory does not exist: ${resolved}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Working directory is not a directory: ${resolved}`);
  }
  return fs.realpathSync.native(resolved);
}

export function getGitRepositoryRoot(cwd) {
  const result = runCommand("git", ["rev-parse", "--show-toplevel"], { cwd });
  const errorCode = result.error && "code" in result.error ? result.error.code : null;
  if (errorCode === "ENOENT") {
    throw new Error("git is not installed. Install Git and retry.");
  }
  if (result.status !== 0) {
    throw new Error("This command must run inside a Git repository.");
  }
  return canonicalDirectory(result.stdout.trim());
}

export function resolveWorkspace(cwd, options = {}) {
  const canonicalCwd = canonicalDirectory(cwd);
  if (options.requireGit) {
    return getGitRepositoryRoot(canonicalCwd);
  }
  try {
    return getGitRepositoryRoot(canonicalCwd);
  } catch {
    return canonicalCwd;
  }
}
