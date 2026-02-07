# fish-tree Architecture

> Git worktree management TUI built with OpenTUI (React) + Bun

## 1. Project Structure

```
fish-tree/
├── src/
│   ├── index.ts              # CLI entry point — arg parsing + TUI bootstrap
│   ├── app.tsx               # Root React component
│   ├── components/
│   │   ├── worktree-list.tsx  # Main list view of worktrees
│   │   ├── project-picker.tsx # Project selector (multi-repo)
│   │   ├── branch-input.tsx   # New worktree branch name input
│   │   ├── status-bar.tsx     # Bottom bar: keybinds, project name, git info
│   │   ├── confirm-dialog.tsx # "Delete worktree?" confirmation
│   │   └── filter-input.tsx   # Fuzzy filter for worktree list
│   ├── git/
│   │   ├── worktree.ts        # Git worktree operations (add, list, remove, prune)
│   │   ├── repo.ts            # Repository detection + metadata
│   │   └── types.ts           # Worktree + repo data types
│   ├── config/
│   │   ├── schema.ts          # Config type definitions + defaults
│   │   ├── loader.ts          # Read/write ~/.config/fish-tree/config.json
│   │   └── paths.ts           # XDG path resolution
│   ├── state/
│   │   └── store.ts           # App state: useReducer-based store
│   ├── hooks/
│   │   ├── use-worktrees.ts   # Fetch + cache worktree list
│   │   ├── use-git-status.ts  # Per-worktree dirty/clean status
│   │   └── use-keybinds.ts    # Centralized keyboard shortcut handler
│   └── shell/
│       ├── fish-wrapper.fish  # Fish shell function (handles cd)
│       └── install.ts         # Script to install the fish wrapper
├── tests/
│   ├── git/
│   │   ├── worktree.test.ts   # Git operations against temp repos
│   │   └── repo.test.ts       # Repo detection tests
│   ├── config/
│   │   └── loader.test.ts     # Config read/write/defaults
│   └── state/
│       └── store.test.ts      # Reducer logic tests
├── package.json
├── tsconfig.json
├── bunfig.toml
├── CLAUDE.md
└── README.md
```

## 2. OpenTUI Integration

### Setup Pattern

OpenTUI React uses a custom React reconciler that renders to the terminal. The setup:

```ts
// src/index.ts
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { App } from "./app";

const renderer = await createCliRenderer({
  exitOnCtrlC: false, // we handle Ctrl+C ourselves for cleanup
});

const root = createRoot(renderer);
root.render(<App renderer={renderer} />);
```

### TSConfig Requirements

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@opentui/react",
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  }
}
```

### Available JSX Intrinsics

| Element | Use |
|---------|-----|
| `<box>` | Container with border, padding, flex layout |
| `<text>` | Styled text output |
| `<scrollbox>` | Scrollable container (for long worktree lists) |
| `<input>` | Single-line text input (filter, branch name) |
| `<select>` | Selection list |
| `<tab-select>` | Tab-based selection |
| `<span>`, `<strong>`, `<em>` | Inline text modifiers |

### Key Hooks from OpenTUI

| Hook | Purpose |
|------|---------|
| `useKeyboard(handler, opts?)` | Keyboard event handling. Handler receives key info. |
| `useRenderer()` | Access the underlying renderer instance (for `renderer.destroy()`) |
| `useTerminalDimensions()` | Reactive `{ width, height }` for responsive layout |
| `useOnResize(callback)` | Terminal resize events |

### Renderer Lifecycle

```
                    ┌─────────────────┐
                    │ createCliRenderer│
                    │ (takes over tty)│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   createRoot()   │
                    │   .render(<App>)│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  React renders   │
                    │  to terminal     │
                    │  (interactive)   │
                    └────────┬────────┘
                             │
               User selects worktree / presses Ctrl+C
                             │
                    ┌────────▼────────┐
                    │ renderer.destroy │
                    │ (restores tty)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Write selected   │
                    │ path to stdout   │
                    │ (fish reads it)  │
                    └─────────────────┘
```

**Critical detail**: After `renderer.destroy()`, the terminal is restored and we can write to stdout. The fish wrapper captures this output for `cd`.

## 3. Git Abstraction Layer

### Data Types

```ts
// src/git/types.ts

export interface Worktree {
  /** Absolute path to the worktree directory */
  path: string;
  /** HEAD commit hash */
  head: string;
  /** Branch name, or null if detached */
  branch: string | null;
  /** Whether this is the main worktree */
  isMain: boolean;
  /** Whether the worktree is locked */
  isLocked: boolean;
  /** Whether the worktree is prunable (broken link) */
  isPrunable: boolean;
  /** Whether there are uncommitted changes (lazy-loaded) */
  isDirty?: boolean;
}

export interface Project {
  /** Display name (directory name of the bare/main repo) */
  name: string;
  /** Path to the git dir (bare repo or .git directory) */
  gitDir: string;
  /** Path to the main worktree */
  mainWorktree: string;
  /** All worktrees for this project */
  worktrees: Worktree[];
}

export interface WorktreeCreateOptions {
  /** Base path for the new worktree */
  basePath: string;
  /** Branch name to create/checkout */
  branch: string;
  /** Start point (commit, branch, tag). Defaults to HEAD */
  startPoint?: string;
  /** Create a new branch (-b) vs checkout existing */
  createBranch: boolean;
}
```

### Git Operations Module

```ts
// src/git/worktree.ts — all operations use Bun.$

export async function listWorktrees(gitDir: string): Promise<Worktree[]> {
  // Uses: git worktree list --porcelain
  // Parses porcelain output into Worktree[]
}

export async function addWorktree(gitDir: string, opts: WorktreeCreateOptions): Promise<Worktree> {
  // Uses: git -C <gitDir> worktree add [-b <branch>] <path> [<startPoint>]
}

export async function removeWorktree(gitDir: string, path: string, force?: boolean): Promise<void> {
  // Uses: git -C <gitDir> worktree remove [--force] <path>
}

export async function pruneWorktrees(gitDir: string): Promise<void> {
  // Uses: git -C <gitDir> worktree prune
}

export async function isWorktreeDirty(worktreePath: string): Promise<boolean> {
  // Uses: git -C <path> status --porcelain
  // Returns true if output is non-empty
}
```

### Bun.$ Usage Pattern

```ts
import { $ } from "bun";

export async function listWorktrees(gitDir: string): Promise<Worktree[]> {
  const result = await $`git -C ${gitDir} worktree list --porcelain`.text();
  return parsePorcelainOutput(result);
}
```

**Porcelain output format** (one block per worktree, blocks separated by blank lines):
```
worktree /path/to/main
HEAD abc1234
branch refs/heads/main

worktree /path/to/feature
HEAD def5678
branch refs/heads/feature-x
```

The parser splits on double newlines, then extracts fields from each block.

## 4. State Management

### Approach: useReducer + Context

React's built-in `useReducer` is the right fit here. The state is modest and component-local. No need for an external store.

```ts
// src/state/store.ts

export interface AppState {
  /** Currently active project */
  activeProject: Project | null;
  /** All discovered projects */
  projects: Project[];
  /** Index of selected worktree in the list */
  selectedIndex: number;
  /** Current filter text (fuzzy search) */
  filterText: string;
  /** Filtered worktree list (derived) */
  filteredWorktrees: Worktree[];
  /** Current view mode */
  view: "list" | "create" | "confirm-delete" | "project-picker";
  /** Loading state */
  loading: boolean;
  /** Error message to display */
  error: string | null;
  /** The path to cd into (set on selection, triggers exit) */
  selectedPath: string | null;
}

export type AppAction =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SELECT_PROJECT"; project: Project }
  | { type: "MOVE_SELECTION"; delta: number }  // +1 down, -1 up
  | { type: "SET_FILTER"; text: string }
  | { type: "SELECT_WORKTREE" }                // confirm selection → sets selectedPath
  | { type: "SHOW_CREATE" }
  | { type: "SHOW_DELETE" }
  | { type: "SHOW_LIST" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "REFRESH_WORKTREES"; worktrees: Worktree[] };

export function appReducer(state: AppState, action: AppAction): AppState {
  // Pure reducer — no side effects
}
```

### Context Provider

```tsx
// src/app.tsx

const AppContext = React.createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function useAppState() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
```

### Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        App (useReducer)                         │
│                                                                  │
│  ┌─────────────┐    dispatch()    ┌───────────────────────┐     │
│  │  AppState    │◄────────────────│  appReducer           │     │
│  │  (immutable) │                 │  (pure function)      │     │
│  └──────┬──────┘                 └───────────────────────┘     │
│         │                                    ▲                   │
│         │ context                             │ actions           │
│         ▼                                    │                   │
│  ┌──────────────────────────────────────────┐│                   │
│  │              Component Tree              ││                   │
│  │                                          ││                   │
│  │  ┌─────────────┐  ┌──────────────────┐  ││                   │
│  │  │ ProjectPicker│  │  WorktreeList    │──┘│                   │
│  │  └─────────────┘  │  ┌────────────┐  │   │                   │
│  │                    │  │ FilterInput│  │   │                   │
│  │  ┌─────────────┐  │  └────────────┘  │   │                   │
│  │  │ BranchInput │  └──────────────────┘   │                   │
│  │  └─────────────┘  ┌──────────────────┐   │                   │
│  │                    │   StatusBar      │   │                   │
│  │  ┌─────────────┐  └──────────────────┘   │                   │
│  │  │ConfirmDialog│                         │                   │
│  │  └─────────────┘                         │                   │
│  └──────────────────────────────────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
```

## 5. Config System

### Config File Location

Following XDG Base Directory spec:
- Primary: `$XDG_CONFIG_HOME/fish-tree/config.json` (defaults to `~/.config/fish-tree/config.json`)
- Fallback: `~/.fish-tree.json` (for simplicity)

### Schema

```ts
// src/config/schema.ts

export interface FishTreeConfig {
  /** Base directory for worktrees. Default: ~/.worktrees */
  worktreeBase: string;

  /** Projects to manage. Auto-discovered if empty. */
  projects: ProjectConfig[];

  /** Key bindings (overrides defaults) */
  keybinds: Partial<KeybindMap>;

  /** Default branch to create worktrees from */
  defaultBaseBranch: string; // default: "main"

  /** Whether to auto-prune on startup */
  autoPrune: boolean; // default: true

  /** Shell to use for wrapper (auto-detected) */
  shell: "fish" | "zsh" | "bash";
}

export interface ProjectConfig {
  /** Display name */
  name: string;
  /** Path to the repo (bare clone or regular repo) */
  path: string;
}

export interface KeybindMap {
  up: string;           // default: "k" / "up"
  down: string;         // default: "j" / "down"
  select: string;       // default: "enter"
  delete: string;       // default: "d"
  create: string;       // default: "c"
  filter: string;       // default: "/"
  quit: string;         // default: "q" / "ctrl+c"
  switchProject: string; // default: "p"
  prune: string;        // default: "P"
  refresh: string;      // default: "r"
}
```

### Default Config

```json
{
  "worktreeBase": "~/.worktrees",
  "projects": [],
  "keybinds": {},
  "defaultBaseBranch": "main",
  "autoPrune": true,
  "shell": "fish"
}
```

### Config Loader

```ts
// src/config/loader.ts
import { getConfigPath } from "./paths";
import type { FishTreeConfig } from "./schema";

const DEFAULTS: FishTreeConfig = { /* ... */ };

export async function loadConfig(): Promise<FishTreeConfig> {
  const configPath = getConfigPath();
  const file = Bun.file(configPath);
  if (await file.exists()) {
    const raw = await file.json();
    return { ...DEFAULTS, ...raw };
  }
  return DEFAULTS;
}

export async function saveConfig(config: FishTreeConfig): Promise<void> {
  const configPath = getConfigPath();
  await Bun.write(configPath, JSON.stringify(config, null, 2));
}
```

## 6. CLI Entry Point

### Arg Parsing Strategy

Use a lightweight approach — no arg parsing library needed. fish-tree has minimal subcommands:

```ts
// src/index.ts

const args = Bun.argv.slice(2);
const command = args[0];

switch (command) {
  case undefined:
  case "ui":
    // Launch TUI (default)
    await launchTUI();
    break;

  case "jump":
  case "j":
    // Quick jump: fish-tree jump <fuzzy-name>
    // Finds best match, prints path to stdout (no TUI)
    await jumpToWorktree(args[1]);
    break;

  case "add":
  case "a":
    // Quick add: fish-tree add <branch> [--from <base>]
    await quickAddWorktree(args.slice(1));
    break;

  case "list":
  case "ls":
    // Non-interactive list (for scripting)
    await listWorktreesPlain();
    break;

  case "config":
    // Open config file in $EDITOR, or print path
    await openConfig();
    break;

  case "install":
    // Install shell wrapper
    await installShellWrapper();
    break;

  case "--help":
  case "-h":
    printHelp();
    break;

  default:
    // Treat as fuzzy jump target: fish-tree <name>
    await jumpToWorktree(command);
    break;
}
```

### TUI Launch Flow

```ts
async function launchTUI() {
  const config = await loadConfig();
  const projects = await discoverProjects(config);

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  });

  let selectedPath: string | null = null;

  const root = createRoot(renderer);
  root.render(
    <App
      config={config}
      projects={projects}
      onSelect={(path) => {
        selectedPath = path;
        renderer.destroy();
      }}
      onQuit={() => {
        renderer.destroy();
      }}
    />
  );

  // After renderer.destroy() resolves, write the path
  // The fish wrapper reads this from stdout
  if (selectedPath) {
    process.stdout.write(selectedPath);
  }
}
```

**Open question**: `renderer.destroy()` likely returns a promise or is synchronous. The exact API needs verification during implementation. If it's async, we'd await it or use an event listener.

**Alternative approach**: Use a process exit handler:

```ts
process.on("exit", () => {
  if (selectedPath) {
    process.stdout.write(selectedPath);
  }
});
```

## 7. Shell Integration

### Fish Shell Wrapper

```fish
# ~/.config/fish/functions/ft.fish

function ft --description "fish-tree: git worktree manager"
    set -l result (command fish-tree $argv)
    set -l status_code $status

    if test $status_code -eq 0 -a -n "$result" -a -d "$result"
        cd "$result"
    else if test -n "$result"
        echo $result
    end
end
```

**Protocol**:
- Exit code 0 + stdout is a valid directory path → `cd` to it
- Exit code 0 + stdout is not a directory → print it (e.g., list output)
- Exit code non-zero → error, display stderr

### Why a Wrapper is Necessary

A subprocess cannot change the parent shell's working directory. The TUI process writes the selected worktree path to stdout, and the fish function captures it and runs `cd`. This is the same pattern used by `fzf`, `zoxide`, and similar tools.

### Install Script

```ts
// src/shell/install.ts

export async function installShellWrapper() {
  const fishFuncDir = `${Bun.env.HOME}/.config/fish/functions`;
  const wrapperPath = `${fishFuncDir}/ft.fish`;

  // Read the embedded wrapper
  const wrapper = await Bun.file(
    new URL("./fish-wrapper.fish", import.meta.url)
  ).text();

  await Bun.write(wrapperPath, wrapper);
  console.log(`Installed fish wrapper to ${wrapperPath}`);
  console.log(`Use 'ft' to launch fish-tree with cd support.`);
}
```

## 8. Error Handling

### Strategy: Errors as Data, Not Exceptions

Git operations can fail for many reasons. We handle them explicitly:

```ts
// src/git/worktree.ts

export type GitResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: GitError };

export interface GitError {
  code: "WORKTREE_EXISTS" | "BRANCH_EXISTS" | "DIRTY_WORKTREE"
      | "NOT_A_REPO" | "WORKTREE_NOT_FOUND" | "COMMAND_FAILED";
  message: string;
  /** Raw stderr from git */
  stderr: string;
}

export async function addWorktree(
  gitDir: string,
  opts: WorktreeCreateOptions
): Promise<GitResult<Worktree>> {
  try {
    const branchFlag = opts.createBranch ? "-b" : "";
    await $`git -C ${gitDir} worktree add ${branchFlag} ${opts.branch} ${opts.basePath} ${opts.startPoint ?? ""}`.quiet();

    // Re-list to get the new worktree data
    const worktrees = await listWorktrees(gitDir);
    const created = worktrees.find(w => w.path === opts.basePath);
    if (!created) return { ok: false, error: { code: "COMMAND_FAILED", message: "Worktree created but not found in list", stderr: "" } };
    return { ok: true, value: created };
  } catch (e: any) {
    return { ok: false, error: classifyGitError(e.stderr?.toString() ?? e.message) };
  }
}
```

### Error Classification

```ts
function classifyGitError(stderr: string): GitError {
  if (stderr.includes("already exists"))
    return { code: "WORKTREE_EXISTS", message: "Worktree already exists at that path", stderr };
  if (stderr.includes("already checked out"))
    return { code: "BRANCH_EXISTS", message: "Branch is already checked out in another worktree", stderr };
  if (stderr.includes("has changes"))
    return { code: "DIRTY_WORKTREE", message: "Worktree has uncommitted changes", stderr };
  if (stderr.includes("not a git repository"))
    return { code: "NOT_A_REPO", message: "Not a git repository", stderr };
  return { code: "COMMAND_FAILED", message: stderr.trim(), stderr };
}
```

### Error Display in TUI

Errors are dispatched to state and rendered in the status bar:

```tsx
// In StatusBar component
{state.error && (
  <text style={{ fg: "#FF6B6B" }}>
    Error: {state.error}
  </text>
)}
```

Errors auto-clear after 5 seconds or on next action.

### Edge Cases

| Scenario | Handling |
|----------|----------|
| Worktree directory manually deleted | Auto-prune on startup removes stale entries |
| Branch already checked out elsewhere | Show which worktree has it, offer to jump there |
| Dirty worktree on delete attempt | Show warning, require force-confirm |
| Git not installed | Fail fast on startup with clear message |
| No projects configured/discovered | Show "Getting Started" view with setup instructions |
| Permissions error on worktree path | Surface the OS error with the path |

## 9. Testing Strategy

### Layer Separation Enables Testing

```
┌─────────────────────────────────────────┐
│           TUI Components                │  ← Manual testing / visual snapshots
├─────────────────────────────────────────┤
│           State (Reducer)               │  ← Pure function tests (easy)
├─────────────────────────────────────────┤
│           Git Operations                │  ← Integration tests (temp repos)
├─────────────────────────────────────────┤
│           Config Loader                 │  ← Unit tests (temp files)
└─────────────────────────────────────────┘
```

### Git Operations: Integration Tests with Temp Repos

```ts
// tests/git/worktree.test.ts
import { test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { listWorktrees, addWorktree, removeWorktree } from "../../src/git/worktree";

let tempDir: string;

beforeEach(async () => {
  tempDir = await $`mktemp -d`.text().then(s => s.trim());
  // Create a test repo with an initial commit
  await $`git -C ${tempDir} init && git -C ${tempDir} commit --allow-empty -m "init"`;
});

afterEach(async () => {
  await $`rm -rf ${tempDir}`;
});

test("listWorktrees returns main worktree", async () => {
  const worktrees = await listWorktrees(tempDir);
  expect(worktrees).toHaveLength(1);
  expect(worktrees[0].isMain).toBe(true);
  expect(worktrees[0].branch).toBe("main");
});

test("addWorktree creates a new worktree", async () => {
  const result = await addWorktree(tempDir, {
    basePath: `${tempDir}/wt-feature`,
    branch: "feature",
    createBranch: true,
  });
  expect(result.ok).toBe(true);

  const worktrees = await listWorktrees(tempDir);
  expect(worktrees).toHaveLength(2);
});
```

### State Reducer: Pure Function Tests

```ts
// tests/state/store.test.ts
import { test, expect } from "bun:test";
import { appReducer, initialState } from "../../src/state/store";

test("MOVE_SELECTION wraps around", () => {
  const state = { ...initialState, filteredWorktrees: [{}, {}, {}] as any, selectedIndex: 2 };
  const next = appReducer(state, { type: "MOVE_SELECTION", delta: 1 });
  expect(next.selectedIndex).toBe(0); // wraps to top
});

test("SET_FILTER updates filter and recomputes filtered list", () => {
  const state = { ...initialState, activeProject: { worktrees: [
    { branch: "main", path: "/a" },
    { branch: "feature-auth", path: "/b" },
  ]} as any };
  const next = appReducer(state, { type: "SET_FILTER", text: "auth" });
  expect(next.filterText).toBe("auth");
  expect(next.filteredWorktrees).toHaveLength(1);
});
```

### Config Loader: Unit Tests

```ts
// tests/config/loader.test.ts
import { test, expect } from "bun:test";
import { loadConfig } from "../../src/config/loader";

test("loadConfig returns defaults when no config file exists", async () => {
  // Temporarily override config path
  const config = await loadConfig();
  expect(config.worktreeBase).toBe("~/.worktrees");
  expect(config.autoPrune).toBe(true);
});
```

### TUI Components: Manual + Snapshot

TUI components are tested primarily through:
1. **Manual testing** — run the app and interact
2. **Reducer isolation** — components are thin; logic lives in the reducer
3. **Future**: OpenTUI may provide `test-utils.ts` (seen in their package structure) for render testing

## 10. Component Architecture

### App Root

```tsx
// src/app.tsx
import { useState, useReducer, useCallback } from "react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { appReducer, initialState } from "./state/store";
import { WorktreeList } from "./components/worktree-list";
import { ProjectPicker } from "./components/project-picker";
import { BranchInput } from "./components/branch-input";
import { ConfirmDialog } from "./components/confirm-dialog";
import { StatusBar } from "./components/status-bar";
import type { FishTreeConfig, Project } from "./types";

interface AppProps {
  config: FishTreeConfig;
  projects: Project[];
  onSelect: (path: string) => void;
  onQuit: () => void;
}

export function App({ config, projects, onSelect, onQuit }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, {
    ...initialState,
    projects,
    activeProject: projects[0] ?? null,
    filteredWorktrees: projects[0]?.worktrees ?? [],
  });

  useKeyboard((key) => {
    if (state.view === "list") {
      switch (key.name) {
        case "j": case "down":
          dispatch({ type: "MOVE_SELECTION", delta: 1 }); break;
        case "k": case "up":
          dispatch({ type: "MOVE_SELECTION", delta: -1 }); break;
        case "return":
          const wt = state.filteredWorktrees[state.selectedIndex];
          if (wt) onSelect(wt.path);
          break;
        case "q":
          onQuit(); break;
        case "d":
          dispatch({ type: "SHOW_DELETE" }); break;
        case "c":
          dispatch({ type: "SHOW_CREATE" }); break;
        case "p":
          dispatch({ type: "SHOW_PROJECT_PICKER" }); break;
        case "/":
          dispatch({ type: "SHOW_FILTER" }); break;
      }
    }
  });

  return (
    <box flexDirection="column" width="100%">
      {state.view === "project-picker" && (
        <ProjectPicker projects={state.projects} dispatch={dispatch} />
      )}
      {state.view === "list" && (
        <WorktreeList state={state} dispatch={dispatch} />
      )}
      {state.view === "create" && (
        <BranchInput config={config} dispatch={dispatch} />
      )}
      {state.view === "confirm-delete" && (
        <ConfirmDialog
          worktree={state.filteredWorktrees[state.selectedIndex]}
          dispatch={dispatch}
        />
      )}
      <StatusBar state={state} config={config} />
    </box>
  );
}
```

### Worktree List Component

```tsx
// src/components/worktree-list.tsx

export function WorktreeList({ state, dispatch }: Props) {
  return (
    <box flexDirection="column" borderStyle="rounded" padding={1}>
      <text style={{ fg: "#FFD700" }}>
        <strong>{state.activeProject?.name}</strong> worktrees
      </text>
      <box flexDirection="column" gap={0}>
        {state.filteredWorktrees.map((wt, i) => (
          <text key={wt.path} style={{
            fg: i === state.selectedIndex ? "#000000" : "#CCCCCC",
            bg: i === state.selectedIndex ? "#61AFEF" : undefined,
          }}>
            {wt.branch ?? "(detached)"} {wt.isDirty ? "*" : ""} {wt.isLocked ? "🔒" : ""}
          </text>
        ))}
      </box>
    </box>
  );
}
```

## 11. Project Discovery

### How Projects Are Found

Two modes:

1. **Explicit** — listed in `config.json` under `projects[]`
2. **Auto-discovery** — scan common locations for git repos

```ts
// src/git/repo.ts

export async function discoverProjects(config: FishTreeConfig): Promise<Project[]> {
  const projects: Project[] = [];

  // 1. Add explicitly configured projects
  for (const p of config.projects) {
    const project = await loadProject(p.path);
    if (project) projects.push({ ...project, name: p.name });
  }

  // 2. Auto-discover from worktreeBase
  const base = expandPath(config.worktreeBase);
  if (await Bun.file(base).exists()) {
    // Each subdirectory of worktreeBase is a project
    for (const entry of await readdir(base)) {
      if (!projects.some(p => p.name === entry)) {
        const project = await loadProject(`${base}/${entry}`);
        if (project) projects.push(project);
      }
    }
  }

  // 3. Current directory's repo (if not already included)
  const cwd = process.cwd();
  const cwdProject = await loadProject(cwd);
  if (cwdProject && !projects.some(p => p.gitDir === cwdProject.gitDir)) {
    projects.unshift(cwdProject); // Put current project first
  }

  return projects;
}
```

## 12. Worktree Path Convention

When creating worktrees, use a structured path:

```
~/.worktrees/<project-name>/<branch-name>/
```

Example:
```
~/.worktrees/
├── my-app/
│   ├── main/           (main worktree or bare repo)
│   ├── feature-auth/   (worktree)
│   └── bugfix-login/   (worktree)
└── api-server/
    ├── main/
    └── refactor-db/
```

This keeps worktrees organized and predictable. The project name comes from the repo's directory name or explicit config.

## 13. Dependencies

```json
{
  "dependencies": {
    "@opentui/core": "latest",
    "@opentui/react": "latest",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "bun-types": "latest",
    "@types/react": "^19.0.0",
    "typescript": "^5.7.0"
  }
}
```

Minimal dependencies. No arg parsing library (manual switch is fine for ~5 commands). No state management library. No git library (Bun.$ shells out directly).

## 14. Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **React + useReducer** over external state | App state is small enough. React context + reducer gives us testable, predictable state with no extra deps. |
| **Bun.$ for git** over a git library | Git CLI is the most reliable interface. No npm dependency needed. Bun.$ makes shell commands ergonomic. |
| **Porcelain parsing** over regex on human output | `git worktree list --porcelain` gives stable, machine-readable output. |
| **Result types** over try/catch | Makes error handling explicit in the type system. Callers must handle errors. |
| **Fish wrapper** as thin shim | The wrapper does one thing: capture stdout and cd. All logic lives in the Bun binary. Easy to add zsh/bash wrappers later. |
| **XDG config** paths | Standard on Linux/macOS. Respects user customization. |
| **No bare repo requirement** | Works with both bare repos and regular repos with worktrees. |
| **Auto-discovery + explicit config** | Zero-config for simple setups, full control for complex ones. |
| **Centralized worktree base** | `~/.worktrees/` keeps things tidy vs scattered worktree directories. |
| **Vim keybinds** as default | Target audience (CLI power users) expects hjkl navigation. Arrow keys also work. |
