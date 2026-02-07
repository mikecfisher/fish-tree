import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { $ } from "bun";
import { detectGitDir, loadProject, discoverProjects } from "../../src/git/repo";
import type { FishTreeConfig } from "../../src/config/schema";
import { resolve, join } from "path";
import { realpathSync, rmSync, mkdirSync } from "fs";

let tempDir: string;
let cleanupPaths: string[];

async function createTempDir(): Promise<string> {
  const result = await $`mktemp -d`.quiet();
  return realpathSync(result.text().trim());
}

async function createTempRepo(bare = false): Promise<string> {
  const dir = await createTempDir();
  if (bare) {
    await $`git init --bare ${dir}`.quiet();
  } else {
    await $`git -C ${dir} init`.quiet();
    await $`git -C ${dir} config user.email "test@test.com"`.quiet();
    await $`git -C ${dir} config user.name "Test"`.quiet();
    await $`git -C ${dir} commit --allow-empty -m "initial"`.quiet();
  }
  return dir;
}

beforeEach(async () => {
  tempDir = await createTempDir();
  cleanupPaths = [tempDir];
});

afterEach(() => {
  for (const p of cleanupPaths) {
    rmSync(p, { recursive: true, force: true });
  }
});

// ── detectGitDir ───────────────────────────────────────────

describe("detectGitDir", () => {
  test("finds .git in regular repo", async () => {
    const repoDir = await createTempRepo();
    cleanupPaths.push(repoDir);

    const gitDir = await detectGitDir(repoDir);
    expect(gitDir).not.toBeNull();
    expect(gitDir).toBe(resolve(repoDir, ".git"));
  });

  test("finds bare repo git dir", async () => {
    const bareDir = await createTempRepo(true);
    cleanupPaths.push(bareDir);

    const gitDir = await detectGitDir(bareDir);
    expect(gitDir).not.toBeNull();
    // For a bare repo, the git dir is the repo directory itself
    expect(gitDir).toBe(resolve(bareDir, "."));
  });

  test("returns null for non-repo directory", async () => {
    const gitDir = await detectGitDir(tempDir);
    expect(gitDir).toBeNull();
  });

  test("returns null for nonexistent path", async () => {
    const gitDir = await detectGitDir("/nonexistent/path/that/doesnt/exist");
    expect(gitDir).toBeNull();
  });
});

// ── loadProject ────────────────────────────────────────────

describe("loadProject", () => {
  test("loads project from regular repo", async () => {
    const repoDir = await createTempRepo();
    cleanupPaths.push(repoDir);

    const project = await loadProject(repoDir);
    expect(project).not.toBeNull();
    expect(project!.worktrees.length).toBeGreaterThanOrEqual(1);
    expect(project!.mainWorktree).toBe(repoDir);
    expect(project!.gitDir).toBe(resolve(repoDir, ".git"));
  });

  test("project name comes from directory basename", async () => {
    const repoDir = await createTempRepo();
    cleanupPaths.push(repoDir);

    const project = await loadProject(repoDir);
    expect(project).not.toBeNull();
    // Name should be the last segment of the path
    const expectedName = repoDir.split("/").pop();
    expect(project!.name).toBe(expectedName!);
  });

  test("returns null for non-repo", async () => {
    const project = await loadProject(tempDir);
    expect(project).toBeNull();
  });

  test("loads worktrees for project", async () => {
    const repoDir = await createTempRepo();
    cleanupPaths.push(repoDir);

    // Add a worktree
    const wtPath = join(repoDir, "worktrees", "feat");
    await $`git -C ${repoDir} worktree add -b feat ${wtPath}`.quiet();

    const project = await loadProject(repoDir);
    expect(project).not.toBeNull();
    expect(project!.worktrees.length).toBe(2);

    const feat = project!.worktrees.find((w) => w.branch === "feat");
    expect(feat).toBeTruthy();

    await $`git -C ${repoDir} worktree remove ${wtPath}`.quiet();
  });
});

// ── discoverProjects ───────────────────────────────────────

describe("discoverProjects", () => {
  test("discovers projects from configured worktreeBase", async () => {
    // Create a worktreeBase dir with a repo inside
    const baseDir = join(tempDir, "worktrees");
    mkdirSync(baseDir, { recursive: true });

    const repoDir = join(baseDir, "my-project");
    mkdirSync(repoDir);
    await $`git -C ${repoDir} init`.quiet();
    await $`git -C ${repoDir} config user.email "test@test.com"`.quiet();
    await $`git -C ${repoDir} config user.name "Test"`.quiet();
    await $`git -C ${repoDir} commit --allow-empty -m "initial"`.quiet();

    const config: FishTreeConfig = {
      worktreeBase: baseDir,
      projects: [],
      defaultBaseBranch: "main",
      autoPrune: true,
      shell: "auto",
    };

    const projects = await discoverProjects(config);
    // Should find at least the auto-discovered project (may also find cwd project)
    const discovered = projects.find((p) => p.name === "my-project");
    expect(discovered).toBeTruthy();
  });

  test("discovers explicitly configured projects", async () => {
    const repoDir = await createTempRepo();
    cleanupPaths.push(repoDir);

    const config: FishTreeConfig = {
      worktreeBase: join(tempDir, "empty-base"),
      projects: [{ name: "my-configured-project", path: repoDir }],
      defaultBaseBranch: "main",
      autoPrune: true,
      shell: "auto",
    };

    const projects = await discoverProjects(config);
    const configured = projects.find((p) => p.name === "my-configured-project");
    expect(configured).toBeTruthy();
    expect(configured!.gitDir).toBe(resolve(repoDir, ".git"));
  });

  test("deduplicates by gitDir", async () => {
    const repoDir = await createTempRepo();
    cleanupPaths.push(repoDir);

    const config: FishTreeConfig = {
      worktreeBase: join(tempDir, "empty-base"),
      projects: [
        { name: "project-a", path: repoDir },
        { name: "project-b", path: repoDir }, // same repo
      ],
      defaultBaseBranch: "main",
      autoPrune: true,
      shell: "auto",
    };

    const projects = await discoverProjects(config);
    // Only one entry for this gitDir (cwd might add another different one)
    const repoGitDir = resolve(repoDir, ".git");
    const matching = projects.filter((p) => p.gitDir === repoGitDir);
    expect(matching.length).toBe(1);
  });

  test("handles missing worktreeBase gracefully", async () => {
    const config: FishTreeConfig = {
      worktreeBase: join(tempDir, "nonexistent"),
      projects: [],
      defaultBaseBranch: "main",
      autoPrune: true,
      shell: "auto",
    };

    // Should not throw
    const projects = await discoverProjects(config);
    expect(Array.isArray(projects)).toBe(true);
  });
});
