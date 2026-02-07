import { test, expect, describe } from "bun:test";
import { appReducer, initialState, type AppState, type ListItem } from "../../src/state/store";
import type { Project, Worktree } from "../../src/git/types";

function makeWorktree(branch: string, path = `/tmp/${branch}`): Worktree {
  return {
    path,
    head: "abc1234567890abc1234567890abc1234567890ab",
    branch,
    isMain: false,
    isLocked: false,
    isPrunable: false,
  };
}

function makeProject(name: string, branches: string[]): Project {
  const worktrees = branches.map((b, i) => ({
    ...makeWorktree(b, `/tmp/${name}/${b}`),
    isMain: i === 0,
  }));
  return {
    name,
    gitDir: `/tmp/${name}/.git`,
    mainWorktree: `/tmp/${name}/${branches[0]}`,
    worktrees,
  };
}

const projectA = makeProject("project-a", ["main", "feat-auth", "fix-typo"]);
const projectB = makeProject("project-b", ["main", "refactor-db"]);
const testProjects = [projectA, projectB];

function getState(projects = testProjects): AppState {
  return initialState(projects);
}

// ── initialState ───────────────────────────────────────────

describe("initialState", () => {
  test("creates state with correct project count", () => {
    const state = getState();
    expect(state.projects.length).toBe(2);
  });

  test("filteredItems includes all projects and worktrees", () => {
    const state = getState();
    const projectItems = state.filteredItems.filter((i) => i.type === "project");
    const worktreeItems = state.filteredItems.filter((i) => i.type === "worktree");
    expect(projectItems.length).toBe(2);
    expect(worktreeItems.length).toBe(5); // 3 + 2
  });

  test("auto-selects first worktree (not project header)", () => {
    const state = getState();
    // Index 0 = project-a header, index 1 = first worktree
    expect(state.selectedIndex).toBe(1);
    expect(state.filteredItems[1]!.type).toBe("worktree");
  });

  test("view defaults to list", () => {
    const state = getState();
    expect(state.view).toBe("list");
  });

  test("detail pane visible by default", () => {
    const state = getState();
    expect(state.detailPaneVisible).toBe(true);
  });

  test("handles empty projects", () => {
    const state = initialState([]);
    expect(state.filteredItems.length).toBe(0);
    expect(state.selectedIndex).toBe(0);
    expect(state.activeProject).toBeNull();
  });
});

// ── MOVE_SELECTION ─────────────────────────────────────────

describe("MOVE_SELECTION", () => {
  test("increments selectedIndex", () => {
    const state = getState();
    const next = appReducer(state, { type: "MOVE_SELECTION", delta: 1 });
    expect(next.selectedIndex).toBe(state.selectedIndex + 1);
  });

  test("decrements selectedIndex", () => {
    const state = getState();
    const moved = appReducer(state, { type: "MOVE_SELECTION", delta: 1 });
    const back = appReducer(moved, { type: "MOVE_SELECTION", delta: -1 });
    expect(back.selectedIndex).toBe(state.selectedIndex);
  });

  test("wraps around at end", () => {
    const state = getState();
    const lastIndex = state.filteredItems.length - 1;
    const atEnd = { ...state, selectedIndex: lastIndex };
    const next = appReducer(atEnd, { type: "MOVE_SELECTION", delta: 1 });
    expect(next.selectedIndex).toBe(0);
  });

  test("wraps around at start", () => {
    const state = getState();
    const atStart = { ...state, selectedIndex: 0 };
    const next = appReducer(atStart, { type: "MOVE_SELECTION", delta: -1 });
    expect(next.selectedIndex).toBe(state.filteredItems.length - 1);
  });

  test("no-op for empty list", () => {
    const state = initialState([]);
    const next = appReducer(state, { type: "MOVE_SELECTION", delta: 1 });
    expect(next.selectedIndex).toBe(0);
  });
});

// ── SET_FILTER ─────────────────────────────────────────────

describe("SET_FILTER", () => {
  test("filters by branch name", () => {
    const state = getState();
    const filtered = appReducer(state, { type: "SET_FILTER", text: "auth" });
    const worktreeItems = filtered.filteredItems.filter((i) => i.type === "worktree");
    expect(worktreeItems.length).toBe(1);
    const wt = worktreeItems[0] as { type: "worktree"; worktree: Worktree };
    expect(wt.worktree.branch).toBe("feat-auth");
  });

  test("filters by project name", () => {
    const state = getState();
    const filtered = appReducer(state, { type: "SET_FILTER", text: "project-b" });
    const projectItems = filtered.filteredItems.filter((i) => i.type === "project");
    expect(projectItems.length).toBe(1);
    const proj = projectItems[0] as { type: "project"; project: Project };
    expect(proj.project.name).toBe("project-b");
  });

  test("empty filter shows all", () => {
    const state = getState();
    const filtered = appReducer(state, { type: "SET_FILTER", text: "auth" });
    const unfiltered = appReducer(filtered, { type: "SET_FILTER", text: "" });
    expect(unfiltered.filteredItems.length).toBe(state.filteredItems.length);
  });

  test("no match returns empty", () => {
    const state = getState();
    const filtered = appReducer(state, { type: "SET_FILTER", text: "zzzznonexistent" });
    expect(filtered.filteredItems.length).toBe(0);
  });

  test("clamps selectedIndex when filter reduces list", () => {
    const state = getState();
    const lastIndex = state.filteredItems.length - 1;
    const atEnd = { ...state, selectedIndex: lastIndex };
    const filtered = appReducer(atEnd, { type: "SET_FILTER", text: "auth" });
    expect(filtered.selectedIndex).toBeLessThan(filtered.filteredItems.length);
  });
});

// ── TOGGLE_PROJECT ─────────────────────────────────────────

describe("TOGGLE_PROJECT", () => {
  test("collapses a project", () => {
    const state = getState();
    const collapsed = appReducer(state, { type: "TOGGLE_PROJECT", projectName: "project-a" });
    expect(collapsed.collapsedProjects.has("project-a")).toBe(true);
    // Worktrees for project-a should be hidden
    const aWorktrees = collapsed.filteredItems.filter(
      (i) => i.type === "worktree" && (i as { project: Project }).project.name === "project-a",
    );
    expect(aWorktrees.length).toBe(0);
  });

  test("expands a collapsed project", () => {
    const state = getState();
    const collapsed = appReducer(state, { type: "TOGGLE_PROJECT", projectName: "project-a" });
    const expanded = appReducer(collapsed, { type: "TOGGLE_PROJECT", projectName: "project-a" });
    expect(expanded.collapsedProjects.has("project-a")).toBe(false);
    const aWorktrees = expanded.filteredItems.filter(
      (i) => i.type === "worktree" && (i as { project: Project }).project.name === "project-a",
    );
    expect(aWorktrees.length).toBe(3);
  });

  test("clamps selectedIndex after collapse", () => {
    const state = getState();
    const lastIndex = state.filteredItems.length - 1;
    const atEnd = { ...state, selectedIndex: lastIndex };
    const collapsed = appReducer(atEnd, { type: "TOGGLE_PROJECT", projectName: "project-b" });
    expect(collapsed.selectedIndex).toBeLessThan(collapsed.filteredItems.length);
  });
});

// ── SELECT_WORKTREE ────────────────────────────────────────

describe("SELECT_WORKTREE", () => {
  test("sets selectedPath when worktree is selected", () => {
    const state = getState();
    // selectedIndex 1 should be a worktree
    expect(state.filteredItems[state.selectedIndex]!.type).toBe("worktree");
    const selected = appReducer(state, { type: "SELECT_WORKTREE" });
    expect(selected.selectedPath).not.toBeNull();
  });

  test("no-op when project header is selected", () => {
    const state = getState();
    const onProject = { ...state, selectedIndex: 0 };
    expect(onProject.filteredItems[0]!.type).toBe("project");
    const selected = appReducer(onProject, { type: "SELECT_WORKTREE" });
    expect(selected.selectedPath).toBeNull();
  });
});

// ── View switching ─────────────────────────────────────────

describe("view switching", () => {
  test("SHOW_CREATE switches to create view", () => {
    const state = getState();
    const next = appReducer(state, { type: "SHOW_CREATE" });
    expect(next.view).toBe("create");
  });

  test("SHOW_DELETE switches to confirm-delete when non-main worktree selected", () => {
    const state = getState();
    // selectedIndex 2 = second worktree (feat-auth, isMain: false)
    const onNonMain = { ...state, selectedIndex: 2 };
    const next = appReducer(onNonMain, { type: "SHOW_DELETE" });
    expect(next.view).toBe("confirm-delete");
  });

  test("SHOW_DELETE no-op when main worktree selected", () => {
    const state = getState();
    // selectedIndex 1 = first worktree (main, isMain: true)
    const next = appReducer(state, { type: "SHOW_DELETE" });
    expect(next.view).toBe("list");
  });

  test("SHOW_DELETE no-op when project header selected", () => {
    const state = getState();
    const onProject = { ...state, selectedIndex: 0 };
    const next = appReducer(onProject, { type: "SHOW_DELETE" });
    expect(next.view).toBe("list"); // Unchanged
  });

  test("SHOW_HELP switches to help view", () => {
    const state = getState();
    const next = appReducer(state, { type: "SHOW_HELP" });
    expect(next.view).toBe("help");
  });

  test("SHOW_LIST resets to list view and clears filter", () => {
    const state = getState();
    const filtered = appReducer(state, { type: "SET_FILTER", text: "auth" });
    const help = appReducer(filtered, { type: "SHOW_HELP" });
    const back = appReducer(help, { type: "SHOW_LIST" });
    expect(back.view).toBe("list");
    expect(back.filterText).toBe("");
    expect(back.filteredItems.length).toBe(getState().filteredItems.length);
  });
});

// ── SET_LOADING / SET_ERROR ────────────────────────────────

describe("loading and error", () => {
  test("SET_LOADING sets loading flag", () => {
    const state = getState();
    const loading = appReducer(state, { type: "SET_LOADING", loading: true });
    expect(loading.loading).toBe(true);
    const done = appReducer(loading, { type: "SET_LOADING", loading: false });
    expect(done.loading).toBe(false);
  });

  test("SET_ERROR sets error message", () => {
    const state = getState();
    const errored = appReducer(state, { type: "SET_ERROR", error: "something went wrong" });
    expect(errored.error).toBe("something went wrong");
    const cleared = appReducer(errored, { type: "SET_ERROR", error: null });
    expect(cleared.error).toBeNull();
  });
});

// ── REFRESH_WORKTREES ──────────────────────────────────────

describe("REFRESH_WORKTREES", () => {
  test("updates projects and rebuilds filtered items", () => {
    const state = getState();
    const newProject = makeProject("new-project", ["main", "dev"]);
    const refreshed = appReducer(state, {
      type: "REFRESH_WORKTREES",
      projects: [...testProjects, newProject],
    });
    expect(refreshed.projects.length).toBe(3);
    const projectItems = refreshed.filteredItems.filter((i) => i.type === "project");
    expect(projectItems.length).toBe(3);
  });

  test("clears loading flag", () => {
    const state = { ...getState(), loading: true };
    const refreshed = appReducer(state, {
      type: "REFRESH_WORKTREES",
      projects: testProjects,
    });
    expect(refreshed.loading).toBe(false);
  });
});
