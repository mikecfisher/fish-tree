import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { $ } from "bun";
import {
  listWorktrees,
  addWorktree,
  removeWorktree,
  pruneWorktrees,
  isWorktreeDirty,
  classifyGitError,
} from "../../src/git/worktree";
import { join } from "path";
import { realpathSync, rmSync } from "fs";

let tempDir: string;
let cleanupPaths: string[];

async function createTempRepo(): Promise<string> {
  const result = await $`mktemp -d`.quiet();
  // Resolve symlinks (macOS /var → /private/var) so paths match git output
  const dir = realpathSync(result.text().trim());
  await $`git -C ${dir} init`.quiet();
  await $`git -C ${dir} config user.email "test@test.com"`.quiet();
  await $`git -C ${dir} config user.name "Test"`.quiet();
  await $`git -C ${dir} commit --allow-empty -m "initial"`.quiet();
  return dir;
}

beforeEach(async () => {
  tempDir = await createTempRepo();
  cleanupPaths = [tempDir];
});

afterEach(() => {
  for (const p of cleanupPaths) {
    rmSync(p, { recursive: true, force: true });
  }
});

// ── listWorktrees ──────────────────────────────────────────

describe("listWorktrees", () => {
  test("returns main worktree for fresh repo", async () => {
    const result = await listWorktrees(tempDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBe(1);
    const main = result.value[0]!;
    expect(main.path).toBe(tempDir);
    expect(main.isMain).toBe(true);
    expect(main.branch).toBe("main");
    expect(main.head).toMatch(/^[0-9a-f]{40}$/);
    expect(main.isLocked).toBe(false);
    expect(main.isPrunable).toBe(false);
  });

  test("returns multiple worktrees after add", async () => {
    const wtPath = join(tempDir, "..", "wt-feature");
    cleanupPaths.push(realpathSync(join(tempDir, "..")) + "/wt-feature");
    await $`git -C ${tempDir} worktree add -b feature ${wtPath}`.quiet();

    const result = await listWorktrees(tempDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBe(2);
    const feature = result.value.find((w) => w.branch === "feature");
    expect(feature).toBeTruthy();
    expect(feature!.isMain).toBe(false);

    await $`git -C ${tempDir} worktree remove ${wtPath}`.quiet();
  });

  test("returns error for non-git directory", async () => {
    const result = await $`mktemp -d`.quiet();
    const notRepo = realpathSync(result.text().trim());
    cleanupPaths.push(notRepo);
    const listResult = await listWorktrees(notRepo);
    expect(listResult.ok).toBe(false);
    if (listResult.ok) return;
    expect(listResult.error.code).toBe("NOT_A_REPO");
  });
});

// ── addWorktree ────────────────────────────────────────────

describe("addWorktree", () => {
  test("creates worktree with new branch", async () => {
    const wtPath = join(tempDir, "worktrees", "new-feature");
    const result = await addWorktree(tempDir, {
      basePath: wtPath,
      branch: "new-feature",
      createBranch: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.branch).toBe("new-feature");
    expect(result.value.path).toBe(wtPath);

    await $`git -C ${tempDir} worktree remove ${wtPath}`.quiet();
  });

  test("checks out existing branch", async () => {
    await $`git -C ${tempDir} branch existing-branch`.quiet();

    const wtPath = join(tempDir, "worktrees", "existing");
    const result = await addWorktree(tempDir, {
      basePath: wtPath,
      branch: "existing-branch",
      createBranch: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.branch).toBe("existing-branch");

    await $`git -C ${tempDir} worktree remove ${wtPath}`.quiet();
  });

  test("returns BRANCH_EXISTS when already checked out", async () => {
    const wtPath = join(tempDir, "worktrees", "dup-main");
    const result = await addWorktree(tempDir, {
      basePath: wtPath,
      branch: "main",
      createBranch: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("BRANCH_EXISTS");
  });
});

// ── removeWorktree ─────────────────────────────────────────

describe("removeWorktree", () => {
  test("deletes clean worktree", async () => {
    const wtPath = join(tempDir, "worktrees", "to-remove");
    await $`git -C ${tempDir} worktree add -b remove-me ${wtPath}`.quiet();

    const result = await removeWorktree(tempDir, wtPath);
    expect(result.ok).toBe(true);

    const list = await listWorktrees(tempDir);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.find((w) => w.branch === "remove-me")).toBeUndefined();
    }
  });

  test("returns DIRTY_WORKTREE for dirty worktree", async () => {
    const wtPath = join(tempDir, "worktrees", "dirty-remove");
    await $`git -C ${tempDir} worktree add -b dirty-branch ${wtPath}`.quiet();

    await Bun.write(join(wtPath, "dirty.txt"), "uncommitted changes");
    await $`git -C ${wtPath} add dirty.txt`.quiet();

    const result = await removeWorktree(tempDir, wtPath);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DIRTY_WORKTREE");

    await $`git -C ${tempDir} worktree remove --force ${wtPath}`.quiet();
  });

  test("force deletes dirty worktree", async () => {
    const wtPath = join(tempDir, "worktrees", "force-remove");
    await $`git -C ${tempDir} worktree add -b force-branch ${wtPath}`.quiet();

    await Bun.write(join(wtPath, "dirty.txt"), "uncommitted changes");
    await $`git -C ${wtPath} add dirty.txt`.quiet();

    const result = await removeWorktree(tempDir, wtPath, true);
    expect(result.ok).toBe(true);
  });
});

// ── pruneWorktrees ─────────────────────────────────────────

describe("pruneWorktrees", () => {
  test("cleans up manually deleted worktree dirs", async () => {
    const wtPath = join(tempDir, "worktrees", "to-prune");
    await $`git -C ${tempDir} worktree add -b prune-me ${wtPath}`.quiet();

    // Manually delete the directory (simulating user rm -rf)
    rmSync(wtPath, { recursive: true, force: true });

    // Before prune, it should still show as a worktree
    const beforeList = await listWorktrees(tempDir);
    expect(beforeList.ok).toBe(true);
    if (beforeList.ok) {
      const stale = beforeList.value.find((w) => w.branch === "prune-me");
      expect(stale).toBeTruthy();
    }

    // Prune
    const result = await pruneWorktrees(tempDir);
    expect(result.ok).toBe(true);

    // After prune, the stale entry should be gone
    const afterList = await listWorktrees(tempDir);
    expect(afterList.ok).toBe(true);
    if (afterList.ok) {
      expect(afterList.value.find((w) => w.branch === "prune-me")).toBeUndefined();
    }
  });
});

// ── isWorktreeDirty ────────────────────────────────────────

describe("isWorktreeDirty", () => {
  test("returns false for clean worktree", async () => {
    const dirty = await isWorktreeDirty(tempDir);
    expect(dirty).toBe(false);
  });

  test("returns true for worktree with modified files", async () => {
    await Bun.write(join(tempDir, "new-file.txt"), "hello");
    const dirty = await isWorktreeDirty(tempDir);
    expect(dirty).toBe(true);
  });

  test("returns true for worktree with staged files", async () => {
    await Bun.write(join(tempDir, "staged.txt"), "staged");
    await $`git -C ${tempDir} add staged.txt`.quiet();
    const dirty = await isWorktreeDirty(tempDir);
    expect(dirty).toBe(true);
  });
});

// ── classifyGitError ───────────────────────────────────────

describe("classifyGitError", () => {
  test("classifies worktree exists", () => {
    const err = classifyGitError("fatal: 'path' already exists");
    expect(err.code).toBe("WORKTREE_EXISTS");
  });

  test("classifies already a worktree", () => {
    const err = classifyGitError("fatal: 'path' is already a worktree");
    expect(err.code).toBe("WORKTREE_EXISTS");
  });

  test("classifies branch already checked out", () => {
    const err = classifyGitError("fatal: 'main' is already checked out at '/foo'");
    expect(err.code).toBe("BRANCH_EXISTS");
  });

  test("classifies dirty worktree", () => {
    const err = classifyGitError("error: 'path' contains modified or untracked files");
    expect(err.code).toBe("DIRTY_WORKTREE");
  });

  test("classifies not a repo", () => {
    const err = classifyGitError("fatal: not a git repository (or any parent)");
    expect(err.code).toBe("NOT_A_REPO");
  });

  test("classifies unknown error as COMMAND_FAILED", () => {
    const err = classifyGitError("some unknown error");
    expect(err.code).toBe("COMMAND_FAILED");
  });

  test("preserves original stderr", () => {
    const stderr = "fatal: 'main' is already checked out at '/foo/bar'";
    const err = classifyGitError(stderr);
    expect(err.stderr).toBe(stderr);
  });
});
