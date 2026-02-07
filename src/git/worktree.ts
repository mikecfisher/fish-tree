import { $ } from "bun";
import type { Worktree, WorktreeCreateOptions, GitError, GitErrorCode } from "./types.ts";
import { ok, err, type GitResult } from "./types.ts";

/** Extract stderr from a Bun shell error (ShellError has .stderr, regular Error has .message) */
function extractStderr(e: unknown): string {
  if (e && typeof e === "object" && "stderr" in e) {
    const stderr = (e as { stderr: { toString(): string } }).stderr;
    return typeof stderr === "string" ? stderr : stderr.toString();
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Parse `git worktree list --porcelain` output into Worktree objects.
 * Porcelain format: blocks separated by blank lines, fields per line.
 */
function parsePorcelain(output: string): Worktree[] {
  const worktrees: Worktree[] = [];
  const blocks = output.trim().split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) continue;
    const lines = block.trim().split("\n");

    let path = "";
    let head = "";
    let branch: string | null = null;
    let isMain = false;
    let isLocked = false;
    let isPrunable = false;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        path = line.slice("worktree ".length);
      } else if (line.startsWith("HEAD ")) {
        head = line.slice("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        // branch refs/heads/main → main
        branch = line.slice("branch ".length).replace("refs/heads/", "");
      } else if (line === "bare") {
        isMain = true;
      } else if (line === "locked") {
        isLocked = true;
      } else if (line === "prunable") {
        isPrunable = true;
      } else if (line === "detached") {
        branch = null;
      }
    }

    // The first worktree in the list is the main worktree
    if (worktrees.length === 0) {
      isMain = true;
    }

    if (path) {
      worktrees.push({ path, head, branch, isMain, isLocked, isPrunable });
    }
  }

  return worktrees;
}

/** Classify stderr from git commands into structured error codes */
export function classifyGitError(stderr: string): GitError {
  const s = stderr.toLowerCase();

  if (s.includes("already exists") || s.includes("already a worktree")) {
    return { code: "WORKTREE_EXISTS", message: "Worktree already exists", stderr };
  }
  if (s.includes("already checked out") || s.includes("is already checked out") || s.includes("already used by worktree")) {
    return { code: "BRANCH_EXISTS", message: "Branch is already checked out in another worktree", stderr };
  }
  if (s.includes("has changes") || s.includes("contains modified or untracked files") || s.includes("is dirty")) {
    return { code: "DIRTY_WORKTREE", message: "Worktree has uncommitted changes", stderr };
  }
  if (s.includes("not a git repository")) {
    return { code: "NOT_A_REPO", message: "Not a git repository", stderr };
  }
  if (s.includes("is not a valid worktree") || s.includes("is not a working tree")) {
    return { code: "WORKTREE_NOT_FOUND", message: "Worktree not found", stderr };
  }

  return { code: "COMMAND_FAILED", message: "Git command failed", stderr };
}

/** List all worktrees for a git repository */
export async function listWorktrees(gitDir: string): Promise<GitResult<Worktree[]>> {
  try {
    const result = await $`git -C ${gitDir} worktree list --porcelain`.quiet();
    const worktrees = parsePorcelain(result.text());
    return ok(worktrees);
  } catch (e: unknown) {
    const stderr = extractStderr(e);
    return { ok: false, error: classifyGitError(stderr) };
  }
}

/** Create a new worktree */
export async function addWorktree(
  gitDir: string,
  opts: WorktreeCreateOptions,
): Promise<GitResult<Worktree>> {
  try {
    if (opts.createBranch && opts.startPoint) {
      await $`git -C ${gitDir} worktree add -b ${opts.branch} ${opts.basePath} ${opts.startPoint}`.quiet();
    } else if (opts.createBranch) {
      await $`git -C ${gitDir} worktree add -b ${opts.branch} ${opts.basePath}`.quiet();
    } else if (opts.startPoint) {
      await $`git -C ${gitDir} worktree add ${opts.basePath} ${opts.branch} ${opts.startPoint}`.quiet();
    } else {
      await $`git -C ${gitDir} worktree add ${opts.basePath} ${opts.branch}`.quiet();
    }

    // Re-list to get the newly created worktree object
    const listResult = await listWorktrees(gitDir);
    if (!listResult.ok) return listResult as GitResult<Worktree>;

    const newWt = listResult.value.find((wt) => wt.path === opts.basePath);
    if (!newWt) {
      return err("COMMAND_FAILED", `Worktree was created but not found in list at ${opts.basePath}`);
    }
    return ok(newWt);
  } catch (e: unknown) {
    const stderr = extractStderr(e);
    return { ok: false, error: classifyGitError(stderr) };
  }
}

/** Remove a worktree */
export async function removeWorktree(
  gitDir: string,
  path: string,
  force = false,
): Promise<GitResult<void>> {
  try {
    if (force) {
      await $`git -C ${gitDir} worktree remove --force ${path}`.quiet();
    } else {
      await $`git -C ${gitDir} worktree remove ${path}`.quiet();
    }
    return ok(undefined);
  } catch (e: unknown) {
    const stderr = extractStderr(e);
    return { ok: false, error: classifyGitError(stderr) };
  }
}

/** Prune stale worktree entries */
export async function pruneWorktrees(gitDir: string): Promise<GitResult<void>> {
  try {
    await $`git -C ${gitDir} worktree prune`.quiet();
    return ok(undefined);
  } catch (e: unknown) {
    const stderr = extractStderr(e);
    return { ok: false, error: classifyGitError(stderr) };
  }
}

/** Check if a worktree has uncommitted changes */
export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  try {
    const result = await $`git -C ${worktreePath} status --porcelain`.quiet();
    return result.text().trim().length > 0;
  } catch {
    // If we can't check status, assume dirty for safety
    return true;
  }
}
