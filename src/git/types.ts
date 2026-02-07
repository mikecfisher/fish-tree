/** Core worktree representation parsed from `git worktree list --porcelain` */
export interface Worktree {
  path: string;
  head: string;
  branch: string | null;
  isMain: boolean;
  isLocked: boolean;
  isPrunable: boolean;
  isDirty?: boolean;
}

/** A project is a git repository with its associated worktrees */
export interface Project {
  name: string;
  gitDir: string;
  mainWorktree: string;
  worktrees: Worktree[];
}

/** Options for creating a new worktree */
export interface WorktreeCreateOptions {
  basePath: string;
  branch: string;
  startPoint?: string;
  createBranch: boolean;
}

/** Error codes for git operations */
export type GitErrorCode =
  | "WORKTREE_EXISTS"
  | "BRANCH_EXISTS"
  | "DIRTY_WORKTREE"
  | "NOT_A_REPO"
  | "WORKTREE_NOT_FOUND"
  | "COMMAND_FAILED";

/** Structured git error */
export interface GitError {
  code: GitErrorCode;
  message: string;
  stderr: string;
}

/** Discriminated union result type — all git operations return this, never throw */
export type GitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GitError };

/** Helpers for constructing GitResult values */
export function ok<T>(value: T): GitResult<T> {
  return { ok: true, value };
}

export function err<T>(code: GitErrorCode, message: string, stderr = ""): GitResult<T> {
  return { ok: false, error: { code, message, stderr } };
}
