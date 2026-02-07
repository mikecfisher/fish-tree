import { createCliRenderer, type CliRenderer } from "@opentui/core";
import { createRoot, type Root } from "@opentui/react";
import type { ReactNode } from "react";

export interface TUIResult {
  selectedPath: string | null;
}

export interface LaunchTUIOptions {
  render: (onSelect: (path: string) => void, onQuit: () => void) => ReactNode;
}

/**
 * Launch the TUI, render the provided React tree, and wait for the user to
 * either select a worktree path or quit. Returns the selected path (or null).
 *
 * After the renderer is destroyed, stdout is restored and the caller can
 * write the path for the shell wrapper to capture.
 */
export async function launchTUI(options: LaunchTUIOptions): Promise<TUIResult> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useAlternateScreen: true,
    useMouse: false,
  });

  let alreadyResolved = false;

  const result = await new Promise<TUIResult>((resolve) => {
    const root = createRoot(renderer);

    const onSelect = (path: string) => {
      alreadyResolved = true;
      root.unmount();
      renderer.destroy();
      resolve({ selectedPath: path });
    };

    const onQuit = () => {
      alreadyResolved = true;
      root.unmount();
      renderer.destroy();
      resolve({ selectedPath: null });
    };

    renderer.on("destroy", () => {
      if (!alreadyResolved) {
        resolve({ selectedPath: null });
      }
    });

    root.render(options.render(onSelect, onQuit));
  });

  return result;
}
