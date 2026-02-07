import { useReducer, useCallback, useEffect } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import {
  appReducer,
  initialState,
  AppContext,
  type AppState,
} from "./state/store.ts";
import type { FishTreeConfig } from "./config/schema.ts";
import type { Project } from "./git/types.ts";
import { WorktreeList } from "./components/worktree-list.tsx";
import { DetailPane } from "./components/detail-pane.tsx";
import { StatusBar } from "./components/status-bar.tsx";
import { FilterInput } from "./components/filter-input.tsx";
import { CreateDialog } from "./components/create-dialog.tsx";
import { DeleteDialog } from "./components/delete-dialog.tsx";

export interface AppProps {
  config: FishTreeConfig;
  projects: Project[];
  onSelect: (path: string) => void;
  onQuit: () => void;
}

export function App({ config, projects, onSelect, onQuit }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, projects, initialState);
  const { width } = useTerminalDimensions();
  const isCompact = width < 80;

  // When a worktree is selected, fire the exit callback
  useEffect(() => {
    if (state.selectedPath) {
      onSelect(state.selectedPath);
    }
  }, [state.selectedPath]);

  // Global keyboard handler — only active in list view
  useKeyboard((key: KeyEvent) => {
    // Let dialogs/overlays handle their own input
    if (state.view !== "list") return;

    // Filter mode: only Esc exits filter
    if (state.filterText) {
      if (key.name === "escape") {
        dispatch({ type: "SET_FILTER", text: "" });
      }
      return;
    }

    if (key.ctrl && key.name === "c") {
      onQuit();
      return;
    }

    // Normalize shifted keys — OpenTUI may report Shift+D as name:"d" shift:true or name:"D"
    const keyName = key.shift && key.name?.length === 1 ? key.name.toUpperCase() : key.name;

    switch (keyName) {
      case "j":
      case "down":
        dispatch({ type: "MOVE_SELECTION", delta: 1 });
        break;
      case "k":
      case "up":
        dispatch({ type: "MOVE_SELECTION", delta: -1 });
        break;
      case "return": {
        const item = state.filteredItems[state.selectedIndex];
        if (item?.type === "worktree") {
          dispatch({ type: "SELECT_WORKTREE" });
        } else if (item?.type === "project") {
          dispatch({ type: "TOGGLE_PROJECT", projectName: item.project.name });
        }
        break;
      }
      case "space": {
        const item = state.filteredItems[state.selectedIndex];
        if (item?.type === "project") {
          dispatch({ type: "TOGGLE_PROJECT", projectName: item.project.name });
        }
        break;
      }
      case "q":
        onQuit();
        break;
      case "n":
        dispatch({ type: "SHOW_CREATE" });
        break;
      case "d":
        dispatch({ type: "SHOW_DELETE" });
        break;
      case "/":
        dispatch({ type: "SET_FILTER", text: "" });
        break;
      case "?":
        dispatch({ type: "SHOW_HELP" });
        break;
      case "g":
        dispatch({ type: "MOVE_SELECTION", delta: -state.selectedIndex });
        break;
      case "G":
        dispatch({
          type: "MOVE_SELECTION",
          delta: state.filteredItems.length - 1 - state.selectedIndex,
        });
        break;
    }
  });

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      <box flexDirection="column" width="100%" height="100%">
        {/* Main content area */}
        <box flexDirection="row" flexGrow={1}>
          <WorktreeList compact={isCompact} />
          {!isCompact && state.detailPaneVisible && <DetailPane />}
        </box>
        <StatusBar />
      </box>

      {/* Overlays */}
      {state.view === "create" && <CreateDialog config={config} />}
      {state.view === "confirm-delete" && <DeleteDialog />}
    </AppContext.Provider>
  );
}
