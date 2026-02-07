import { $ } from "bun";
import { resolve, basename } from "node:path";
import type { Project } from "./types.ts";
import { ok, err, type GitResult } from "./types.ts";
import { listWorktrees } from "./worktree.ts";
import type { FishTreeConfig } from "../config/schema.ts";
import { expandPath } from "../config/paths.ts";

/**
 * Detect the git directory for a given path.
 * Returns the absolute path to the .git dir, or null if not a repo.
 */
export async function detectGitDir(path: string): Promise<string | null> {
  try {
    const result = await $`git -C ${path} rev-parse --git-dir`.quiet();
    const gitDir = result.text().trim();

    if (!gitDir) return null;

    // Resolve to absolute path
    if (gitDir === "." || gitDir === ".git") {
      // "." means bare repo, ".git" means regular repo
      return resolve(path, gitDir);
    }

    // Already absolute or relative — resolve relative to path
    return resolve(path, gitDir);
  } catch {
    return null;
  }
}

/**
 * Load a project from a directory path.
 * Returns null if the path is not a git repository.
 */
export async function loadProject(path: string): Promise<Project | null> {
  const gitDir = await detectGitDir(path);
  if (!gitDir) return null;

  const result = await listWorktrees(path);
  const worktrees = result.ok ? result.value : [];

  const mainWorktree = worktrees.find((wt) => wt.isMain)?.path ?? path;

  return {
    name: basename(mainWorktree),
    gitDir,
    mainWorktree,
    worktrees,
  };
}

/**
 * Discover all projects from config and auto-discovery.
 * Order: current directory first, then configured projects, then auto-discovered.
 * Deduplicates by gitDir path.
 */
export async function discoverProjects(config: FishTreeConfig): Promise<Project[]> {
  const seen = new Set<string>();

  // 1. Current directory's repo (put first)
  const cwd = process.cwd();
  const cwdProject = await loadProject(cwd);
  if (cwdProject) {
    seen.add(cwdProject.gitDir);
  }

  // 2. Configured projects + auto-discovered — load in parallel
  const configuredPaths = config.projects.map((pc) => ({
    path: expandPath(pc.path),
    name: pc.name,
  }));

  let autoPaths: Array<{ path: string; name?: string }> = [];
  const basePath = expandPath(config.worktreeBase);
  try {
    const entries = await Array.fromAsync(
      new Bun.Glob("*").scan({ cwd: basePath, onlyFiles: false }),
    );
    autoPaths = entries.map((entry) => ({ path: resolve(basePath, entry) }));
  } catch {
    // ~/.worktrees/ may not exist — that's fine
  }

  const allPaths = [...configuredPaths, ...autoPaths];
  const loaded = await Promise.all(allPaths.map((p) => loadProject(p.path)));

  // Assemble results: cwd first, then others deduplicated
  const projects: Project[] = [];
  if (cwdProject) {
    projects.push(cwdProject);
  }

  for (let i = 0; i < allPaths.length; i++) {
    const project = loaded[i];
    if (project && !seen.has(project.gitDir)) {
      if (allPaths[i]!.name) {
        project.name = allPaths[i]!.name!;
      }
      projects.push(project);
      seen.add(project.gitDir);
    }
  }

  return projects;
}

/**
 * List remote branches for branch autocomplete.
 */
export async function listRemoteBranches(gitDir: string): Promise<string[]> {
  try {
    const result = await $`git -C ${gitDir} branch -r --format=${"%(refname:short)"}`.quiet();
    return result
      .text()
      .trim()
      .split("\n")
      .filter((b) => b && !b.includes("HEAD"));
  } catch {
    return [];
  }
}
