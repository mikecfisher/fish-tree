import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { $ } from "bun";
import { join } from "path";
import { realpathSync, rmSync, mkdirSync } from "fs";

let tempDir: string;
let repoDir: string;
let configDir: string;

const SRC = join(import.meta.dir, "../../src/index.ts");

async function runFT(args: string[], cwd?: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(["bun", "run", SRC, ...args], {
    cwd: cwd ?? repoDir,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configDir,
      // Prevent TUI launch in any test
      TERM: "dumb",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { stdout, stderr, exitCode };
}

beforeAll(async () => {
  const result = await $`mktemp -d`.quiet();
  tempDir = realpathSync(result.text().trim());

  // Create a test repo with multiple branches
  repoDir = join(tempDir, "test-repo");
  mkdirSync(repoDir);
  await $`git -C ${repoDir} init`.quiet();
  await $`git -C ${repoDir} config user.email "test@test.com"`.quiet();
  await $`git -C ${repoDir} config user.name "Test"`.quiet();
  await $`git -C ${repoDir} commit --allow-empty -m "initial"`.quiet();

  // Create additional branches
  await $`git -C ${repoDir} branch feat-auth`.quiet();
  await $`git -C ${repoDir} branch fix-typo`.quiet();

  // Add a worktree so we have something to list/jump to
  const wtPath = join(repoDir, "worktrees", "feat-auth");
  await $`git -C ${repoDir} worktree add ${wtPath} feat-auth`.quiet();

  // Create config dir pointing at our repo
  configDir = join(tempDir, "config");
  const fishTreeConfig = join(configDir, "fish-tree");
  mkdirSync(fishTreeConfig, { recursive: true });
  await Bun.write(
    join(fishTreeConfig, "config.json"),
    JSON.stringify({
      worktreeBase: join(tempDir, "worktrees"),
      projects: [{ name: "test-repo", path: repoDir }],
    }),
  );
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ── --help ─────────────────────────────────────────────────

describe("ft --help", () => {
  test("outputs usage text", async () => {
    const result = await runFT(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("fish-tree");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("Commands:");
  });

  test("help command also works", async () => {
    const result = await runFT(["help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  test("-h alias works", async () => {
    const result = await runFT(["-h"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });
});

// ── --version ──────────────────────────────────────────────

describe("ft --version", () => {
  test("outputs version", async () => {
    const result = await runFT(["--version"]);
    expect(result.exitCode).toBe(0);
    // Should output something (version or 0.0.0)
    expect(result.stdout.trim()).toBeTruthy();
  });
});

// ── list ───────────────────────────────────────────────────

describe("ft list", () => {
  test("outputs worktree info", async () => {
    const result = await runFT(["list"]);
    expect(result.exitCode).toBe(0);
    // Should have at least the main worktree and the feat-auth worktree
    expect(result.stdout).toContain("main");
    expect(result.stdout).toContain("feat-auth");
  });

  test("--json outputs valid JSON", async () => {
    const result = await runFT(["list", "--json"]);
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    // Each project should have worktrees
    expect(data[0].worktrees).toBeDefined();
    expect(Array.isArray(data[0].worktrees)).toBe(true);
  });

  test("ls alias works", async () => {
    const result = await runFT(["ls"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("main");
  });
});

// ── jump ───────────────────────────────────────────────────

describe("ft jump", () => {
  test("exact branch match outputs correct path", async () => {
    const result = await runFT(["jump", "feat-auth"]);
    expect(result.exitCode).toBe(0);
    // stdout should be the worktree path
    expect(result.stdout).toContain("feat-auth");
  });

  test("partial match works (fuzzy)", async () => {
    const result = await runFT(["jump", "auth"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("feat-auth");
  });

  test("no match exits with error", async () => {
    const result = await runFT(["jump", "nonexistent-branch-zzz"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("No worktree matching");
  });

  test("missing argument exits with usage", async () => {
    const result = await runFT(["jump"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Usage:");
  });

  test("unknown command treated as fuzzy jump", async () => {
    const result = await runFT(["auth"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("feat-auth");
  });
});

// ── add ────────────────────────────────────────────────────

describe("ft add", () => {
  test("creates worktree and outputs path", async () => {
    const result = await runFT(["add", "test-add-branch", "--project", "test-repo"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeTruthy();

    // Clean up: remove the created worktree
    const wtPath = result.stdout.trim();
    await $`git -C ${repoDir} worktree remove --force ${wtPath}`.quiet().nothrow();
    await $`git -C ${repoDir} branch -D test-add-branch`.quiet().nothrow();
  });

  test("missing branch exits with usage", async () => {
    const result = await runFT(["add"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Usage:");
  });
});

// ── rm ─────────────────────────────────────────────────────

describe("ft rm", () => {
  test("removes a clean worktree", async () => {
    // Create a worktree to remove
    const wtPath = join(repoDir, "worktrees", "to-remove");
    await $`git -C ${repoDir} worktree add -b rm-test-branch ${wtPath}`.quiet();

    const result = await runFT(["rm", "rm-test-branch"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Removed");

    // Clean up branch
    await $`git -C ${repoDir} branch -D rm-test-branch`.quiet().nothrow();
  });

  test("missing name exits with usage", async () => {
    const result = await runFT(["rm"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Usage:");
  });
});
