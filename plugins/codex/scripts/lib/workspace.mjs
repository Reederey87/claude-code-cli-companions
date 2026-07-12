import { getSharedRepoRoot } from "./git.mjs";

/**
 * Workspace key for companion state (jobs/config). Uses the shared main-repo root
 * so linked worktrees see the same job listings. Review/git context still uses
 * getRepoRoot/ensureGitRepository (worktree-local show-toplevel).
 */
export function resolveWorkspaceRoot(cwd) {
  try {
    return getSharedRepoRoot(cwd);
  } catch {
    return cwd;
  }
}
