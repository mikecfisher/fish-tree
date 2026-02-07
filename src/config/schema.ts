/** Per-project config entry */
export interface ProjectConfig {
  name: string;
  path: string;
}

/** Main configuration (user-editable, stored in XDG config dir) */
export interface FishTreeConfig {
  worktreeBase: string;
  projects: ProjectConfig[];
  defaultBaseBranch: string;
  autoPrune: boolean;
  shell: "fish" | "zsh" | "bash" | "auto";
}

/** Session state (not user-edited, stored in XDG state dir) */
export interface FishTreeState {
  lastProject: string | null;
  lastWorktreePerProject: Record<string, string>;
  collapsedProjects: string[];
  viewMode: "compact" | "split";
}

export const DEFAULT_CONFIG: FishTreeConfig = {
  worktreeBase: "~/.worktrees",
  projects: [],
  defaultBaseBranch: "main",
  autoPrune: true,
  shell: "auto",
};

export const DEFAULT_STATE: FishTreeState = {
  lastProject: null,
  lastWorktreePerProject: {},
  collapsedProjects: [],
  viewMode: "split",
};
