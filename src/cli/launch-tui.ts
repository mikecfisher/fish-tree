// TUI launcher — loads config, discovers projects, renders TUI, outputs selected path.
// This is the default command when `ft` is run without arguments.

import { createElement } from "react";
import { loadConfig, loadState, saveState } from "../config/loader";
import { discoverProjects } from "../git/repo";
import { launchTUI as runTUI } from "../tui/renderer";
import { App } from "../app";

export async function launchTUI(): Promise<void> {
  const config = await loadConfig();
  const projects = await discoverProjects(config);
  const state = await loadState();

  if (projects.length === 0) {
    console.error(
      "No projects found. Run 'ft config' to set up projects, or run from a git repo.",
    );
    process.exit(1);
  }

  const result = await runTUI({
    render: (onSelect, onQuit) =>
      createElement(App, { config, projects, onSelect, onQuit }),
  });

  // Save session state (cursor position, collapsed groups, etc.)
  await saveState(state);

  if (result.selectedPath) {
    // Write path to result file (for shell wrapper) or stdout (for direct use)
    const resultFile = process.env.FT_RESULT_FILE;
    if (resultFile) {
      await Bun.write(resultFile, result.selectedPath);
    } else {
      process.stdout.write(result.selectedPath);
    }
  }
}
