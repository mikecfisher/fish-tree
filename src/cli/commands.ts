// CLI commands — each function is invoked by src/index.ts based on subcommand routing.
// Commands that produce a directory path on stdout trigger cd via the shell wrapper.

import { loadConfig, saveConfig } from "../config/loader";
import { getConfigPath } from "../config/paths";
import { expandPath } from "../config/paths";
import { discoverProjects, loadProject } from "../git/repo";
import {
  addWorktree,
  removeWorktree,
  isWorktreeDirty,
} from "../git/worktree";
import type { Project, Worktree } from "../git/types";
import { resolve, join } from "node:path";

/** Simple fuzzy match: all characters of query appear in order in target */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Exact match
  if (t === q) return 1000;

  // Starts with
  if (t.startsWith(q)) return 500;

  // Contains substring
  if (t.includes(q)) return 200;

  // Sequential character match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  if (qi === q.length) return 50;

  return 0;
}

/** Flatten all worktrees across all projects with their parent project */
function flattenWorktrees(projects: Project[]): Array<{ project: Project; worktree: Worktree }> {
  const items: Array<{ project: Project; worktree: Worktree }> = [];
  for (const project of projects) {
    for (const wt of project.worktrees) {
      items.push({ project, worktree: wt });
    }
  }
  return items;
}

/** Find the best matching worktree for a fuzzy query */
function findBestMatch(query: string, projects: Project[]) {
  const all = flattenWorktrees(projects);
  const scored = all
    .map((item) => {
      const branchScore = item.worktree.branch
        ? fuzzyMatch(query, item.worktree.branch)
        : 0;
      const projectScore = fuzzyMatch(query, item.project.name);
      // Also match against the directory name (useful for detached worktrees with no branch)
      const dirName = item.worktree.path.split("/").pop() ?? "";
      const pathScore = fuzzyMatch(query, dirName);
      return { ...item, score: Math.max(branchScore, projectScore * 0.5, pathScore) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored;
}

export async function jumpToWorktree(query: string | undefined): Promise<void> {
  if (!query) {
    console.error("Usage: ft jump <name>");
    process.exit(1);
  }

  const config = await loadConfig();
  const projects = await discoverProjects(config);

  if (projects.length === 0) {
    console.error("No projects found. Run 'ft config' to configure projects.");
    process.exit(1);
  }

  const matches = findBestMatch(query, projects);

  if (matches.length === 0) {
    console.error(`No worktree matching "${query}"`);
    process.exit(1);
  }

  if (matches.length === 1 || matches[0]!.score > matches[1]!.score * 1.5) {
    // Clear winner — output path for shell wrapper to cd
    process.stdout.write(matches[0]!.worktree.path);
    return;
  }

  // Multiple close matches — show numbered list
  console.error(`Multiple matches for "${query}":`);
  for (let i = 0; i < Math.min(matches.length, 10); i++) {
    const m = matches[i]!;
    const branchName = m.worktree.branch ?? "(detached)";
    console.error(`  ${i + 1}. ${m.project.name}/${branchName}  ${m.worktree.path}`);
  }
  process.exit(1);
}

export async function quickAddWorktree(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error("Usage: ft add <branch> [--from <base>] [--project <name>]");
    process.exit(1);
  }

  const branch = args[0]!;
  let startPoint: string | undefined;
  let projectName: string | undefined;

  // Parse flags
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--from" && args[i + 1]) {
      startPoint = args[++i];
    } else if (args[i] === "--project" && args[i + 1]) {
      projectName = args[++i];
    }
  }

  const config = await loadConfig();
  const projects = await discoverProjects(config);

  // Determine which project to add to
  let project: Project | undefined;
  if (projectName) {
    project = projects.find(
      (p) => p.name.toLowerCase() === projectName!.toLowerCase(),
    );
    if (!project) {
      console.error(`Project "${projectName}" not found`);
      process.exit(1);
    }
  } else {
    project = projects[0]; // First = current directory's project
  }

  if (!project) {
    console.error("No project found. Run from a git repo or configure projects.");
    process.exit(1);
  }

  // Determine worktree path
  const worktreeBase = expandPath(config.worktreeBase);
  const safeBranch = branch.replace(/\//g, "-");
  const worktreePath = resolve(join(worktreeBase, project.name, safeBranch));

  const result = await addWorktree(project.gitDir, {
    basePath: worktreePath,
    branch,
    startPoint,
    createBranch: !startPoint,
  });

  if (!result.ok) {
    console.error(`Failed to create worktree: ${result.error.message}`);
    if (result.error.stderr) console.error(result.error.stderr);
    process.exit(1);
  }

  // Output path for shell wrapper to cd
  process.stdout.write(result.value.path);
}

export async function listWorktreesPlain(args: string[]): Promise<void> {
  const asJson = args.includes("--json");
  let projectFilter: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) {
      projectFilter = args[++i];
    }
  }

  const config = await loadConfig();
  let projects = await discoverProjects(config);

  if (projectFilter) {
    projects = projects.filter(
      (p) => p.name.toLowerCase() === projectFilter!.toLowerCase(),
    );
  }

  if (asJson) {
    const data = projects.map((p) => ({
      name: p.name,
      gitDir: p.gitDir,
      worktrees: p.worktrees.map((wt) => ({
        branch: wt.branch,
        path: wt.path,
        isMain: wt.isMain,
        isLocked: wt.isLocked,
      })),
    }));
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  // Plain text: one worktree per line
  for (const project of projects) {
    for (const wt of project.worktrees) {
      const branch = wt.branch ?? "(detached)";
      const flags = [
        wt.isMain ? "main" : null,
        wt.isLocked ? "locked" : null,
      ]
        .filter(Boolean)
        .join(",");
      const status = flags ? ` [${flags}]` : "";
      console.log(`${project.name}/${branch}\t${wt.path}${status}`);
    }
  }
}

export async function removeWorktreeCLI(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.error("Usage: ft rm <name> [--force]");
    process.exit(1);
  }

  const force = args.includes("--force") || args.includes("-f");
  const query = args.find((a) => !a.startsWith("-"))!;

  const config = await loadConfig();
  const projects = await discoverProjects(config);
  const matches = findBestMatch(query, projects);

  if (matches.length === 0) {
    console.error(`No worktree matching "${query}"`);
    process.exit(1);
  }

  const target = matches[0]!;
  if (target.worktree.isMain) {
    console.error("Cannot remove the main worktree");
    process.exit(1);
  }

  // Check for dirty state unless --force
  if (!force) {
    const dirty = await isWorktreeDirty(target.worktree.path);
    if (dirty) {
      console.error(
        `Worktree "${target.worktree.branch}" has uncommitted changes. Use --force to remove anyway.`,
      );
      process.exit(1);
    }
  }

  const result = await removeWorktree(
    target.project.gitDir,
    target.worktree.path,
    force,
  );

  if (!result.ok) {
    console.error(`Failed to remove worktree: ${result.error.message}`);
    process.exit(1);
  }

  console.log(
    `Removed worktree ${target.project.name}/${target.worktree.branch ?? "(detached)"}`,
  );
}

export async function openConfig(): Promise<void> {
  const configPath = getConfigPath();
  const file = Bun.file(configPath);

  // Create with defaults if it doesn't exist
  if (!(await file.exists())) {
    const config = await loadConfig();
    await saveConfig(config);
    console.log(`Created default config at ${configPath}`);
  }

  const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi";
  const proc = Bun.spawn([editor, configPath], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

export function printHelp(): void {
  console.log(`fish-tree — git worktree manager

Usage: ft [command] [options]

Commands:
  (none)            Launch TUI browser
  ui                Launch TUI browser
  jump, j <name>    Fuzzy jump to a worktree (cd via shell wrapper)
  add, a <branch>   Create a new worktree
  list, ls          List all worktrees
  rm, remove <name> Remove a worktree
  config            Open config in $EDITOR
  install           Install shell wrapper for current shell
  help              Show this help message

Options:
  -h, --help        Show this help message
  -v, --version     Show version number

List options:
  --json            Output as JSON
  --project <name>  Filter to a specific project

Add options:
  --from <base>     Base branch/commit for the new worktree
  --project <name>  Target project (defaults to current repo)

Remove options:
  --force, -f       Force remove even with uncommitted changes

Arguments:
  ft <name>         Shorthand for 'ft jump <name>'

Examples:
  ft                Open the TUI
  ft auth           Jump to worktree matching "auth"
  ft add feat/login Create worktree for feat/login branch
  ft list --json    List worktrees as JSON
  ft rm feat/login  Remove the feat/login worktree
  ft install        Install shell wrapper for cd integration
  ft install --all  Install for fish, bash, and zsh`);
}
