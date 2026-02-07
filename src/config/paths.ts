import { join } from "node:path";
import { homedir } from "node:os";

/** Expand ~ to $HOME in a path */
export function expandPath(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return join(homedir(), p.slice(1));
  }
  return p;
}

/** XDG config directory: $XDG_CONFIG_HOME/fish-tree or ~/.config/fish-tree */
export function getConfigDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "fish-tree") : join(homedir(), ".config", "fish-tree");
}

/** Full path to the config file */
export function getConfigPath(): string {
  return join(getConfigDir(), "config.json");
}

/** XDG state directory: $XDG_STATE_HOME/fish-tree or ~/.local/state/fish-tree */
export function getStateDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  return xdg ? join(xdg, "fish-tree") : join(homedir(), ".local", "state", "fish-tree");
}

/** Full path to the session state file */
export function getStatePath(): string {
  return join(getStateDir(), "state.json");
}
