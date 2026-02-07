import { createContext, useContext } from "react";
import type { Project, Worktree } from "../git/types.ts";

/** A flat list item — either a project header or a worktree entry */
export type ListItem =
  | { type: "project"; project: Project }
  | { type: "worktree"; worktree: Worktree; project: Project };

/** Full application state */
export interface AppState {
  projects: Project[];
  activeProject: Project | null;
  selectedIndex: number;
  filterText: string;
  filteredItems: ListItem[];
  view: "list" | "create" | "confirm-delete" | "project-picker" | "help";
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
  collapsedProjects: Set<string>;
  detailPaneVisible: boolean;
}

/** All state transitions */
export type AppAction =
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SELECT_PROJECT"; project: Project }
  | { type: "MOVE_SELECTION"; delta: number }
  | { type: "SET_FILTER"; text: string }
  | { type: "SELECT_WORKTREE" }
  | { type: "TOGGLE_PROJECT"; projectName: string }
  | { type: "SHOW_CREATE" }
  | { type: "SHOW_DELETE" }
  | { type: "SHOW_HELP" }
  | { type: "SHOW_LIST" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "REFRESH_WORKTREES"; projects: Project[] };

/** Build the flat list of items from projects, respecting collapsed state and filter */
function buildFilteredItems(
  projects: Project[],
  collapsed: Set<string>,
  filterText: string,
): ListItem[] {
  const items: ListItem[] = [];
  const query = filterText.toLowerCase();

  for (const project of projects) {
    // Check if project or any of its worktrees match the filter
    const projectMatches = !query || project.name.toLowerCase().includes(query);
    const matchingWorktrees = project.worktrees.filter(
      (wt) =>
        !query ||
        (wt.branch?.toLowerCase().includes(query) ?? false) ||
        project.name.toLowerCase().includes(query),
    );

    if (!projectMatches && matchingWorktrees.length === 0) continue;

    items.push({ type: "project", project });

    if (!collapsed.has(project.name)) {
      const worktrees = query ? matchingWorktrees : project.worktrees;
      for (const worktree of worktrees) {
        items.push({ type: "worktree", worktree, project });
      }
    }
  }

  return items;
}

/** Create initial state from a list of projects */
export function initialState(projects: Project[]): AppState {
  const collapsed = new Set<string>();
  const filteredItems = buildFilteredItems(projects, collapsed, "");

  // Auto-select first worktree (skip project header)
  const firstWorktreeIndex = filteredItems.findIndex((i) => i.type === "worktree");

  return {
    projects,
    activeProject: projects[0] ?? null,
    selectedIndex: firstWorktreeIndex >= 0 ? firstWorktreeIndex : 0,
    filterText: "",
    filteredItems,
    view: "list",
    loading: false,
    error: null,
    selectedPath: null,
    collapsedProjects: collapsed,
    detailPaneVisible: true,
  };
}

/** Pure reducer for all state transitions */
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_PROJECTS":
    case "REFRESH_WORKTREES": {
      const filteredItems = buildFilteredItems(
        action.projects,
        state.collapsedProjects,
        state.filterText,
      );
      const selectedIndex = Math.min(state.selectedIndex, Math.max(0, filteredItems.length - 1));
      return {
        ...state,
        projects: action.projects,
        filteredItems,
        selectedIndex,
        loading: false,
      };
    }

    case "SELECT_PROJECT":
      return { ...state, activeProject: action.project };

    case "MOVE_SELECTION": {
      if (state.filteredItems.length === 0) return state;
      let next = state.selectedIndex + action.delta;
      // Wrap around
      if (next < 0) next = state.filteredItems.length - 1;
      if (next >= state.filteredItems.length) next = 0;
      return { ...state, selectedIndex: next };
    }

    case "SET_FILTER": {
      const filteredItems = buildFilteredItems(
        state.projects,
        state.collapsedProjects,
        action.text,
      );
      const selectedIndex = Math.min(state.selectedIndex, Math.max(0, filteredItems.length - 1));
      return { ...state, filterText: action.text, filteredItems, selectedIndex };
    }

    case "SELECT_WORKTREE": {
      const item = state.filteredItems[state.selectedIndex];
      if (!item || item.type !== "worktree") return state;
      return { ...state, selectedPath: item.worktree.path };
    }

    case "TOGGLE_PROJECT": {
      const next = new Set(state.collapsedProjects);
      if (next.has(action.projectName)) {
        next.delete(action.projectName);
      } else {
        next.add(action.projectName);
      }
      const filteredItems = buildFilteredItems(state.projects, next, state.filterText);
      const selectedIndex = Math.min(state.selectedIndex, Math.max(0, filteredItems.length - 1));
      return { ...state, collapsedProjects: next, filteredItems, selectedIndex };
    }

    case "SHOW_CREATE":
      return { ...state, view: "create" };

    case "SHOW_DELETE": {
      // Only allow if a non-main worktree is selected
      const item = state.filteredItems[state.selectedIndex];
      if (!item || item.type !== "worktree" || item.worktree.isMain) return state;
      return { ...state, view: "confirm-delete" };
    }

    case "SHOW_HELP":
      return { ...state, view: "help" };

    case "SHOW_LIST": {
      const resetItems = buildFilteredItems(state.projects, state.collapsedProjects, "");
      return { ...state, view: "list", filterText: "", filteredItems: resetItems, error: null };
    }

    case "SET_LOADING":
      return { ...state, loading: action.loading };

    case "SET_ERROR":
      return { ...state, error: action.error };
  }
}

/** Context for sharing state across components */
export interface AppContextValue {
  state: AppState;
  dispatch: (action: AppAction) => void;
}

export const AppContext = createContext<AppContextValue>({
  state: initialState([]),
  dispatch: () => {},
});

/** Hook to access app state from any component */
export function useAppState(): AppContextValue {
  return useContext(AppContext);
}
