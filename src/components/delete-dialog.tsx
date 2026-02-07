import { useState, useEffect } from "react";
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import { useAppState } from "../state/store.ts";
import { removeWorktree, isWorktreeDirty, listWorktrees } from "../git/worktree.ts";

export function DeleteDialog() {
  const { state, dispatch } = useAppState();
  const item = state.filteredItems[state.selectedIndex];

  const [dirty, setDirty] = useState<boolean | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only valid for worktree items
  const worktree = item?.type === "worktree" ? item.worktree : null;
  const project = item?.type === "worktree" ? item.project : null;

  // Check if dirty on mount
  useEffect(() => {
    if (!worktree) return;
    isWorktreeDirty(worktree.path).then(setDirty);
  }, [worktree?.path]);

  useKeyboard((key: KeyEvent) => {
    const keyName = key.shift && key.name?.length === 1 ? key.name.toUpperCase() : key.name;

    if (keyName === "escape") {
      dispatch({ type: "SHOW_LIST" });
      return;
    }

    // Clean worktree: Enter confirms
    if (keyName === "return" && dirty === false && !deleting) {
      handleDelete(false);
      return;
    }

    // Dirty worktree: only D (shift+d) force-deletes
    if (keyName === "D" && dirty === true && !deleting) {
      handleDelete(true);
      return;
    }
  });

  async function handleDelete(force: boolean) {
    if (!worktree || !project) return;
    setDeleting(true);
    setError(null);

    const result = await removeWorktree(project.gitDir, worktree.path, force);

    if (!result.ok) {
      setError(result.error.message);
      setDeleting(false);
      return;
    }

    // Refresh
    const updated = await Promise.all(
      state.projects.map(async (p) => {
        const wResult = await listWorktrees(p.gitDir);
        return {
          ...p,
          worktrees: wResult.ok ? wResult.value : p.worktrees,
        };
      }),
    );

    dispatch({ type: "REFRESH_WORKTREES", projects: updated });
    dispatch({ type: "SHOW_LIST" });
  }

  useEffect(() => {
    if (!worktree) dispatch({ type: "SHOW_LIST" });
  }, [worktree]);

  if (!worktree) return null;

  const branchName = worktree.branch ?? "(detached)";

  if (worktree.isMain) {
    return (
      <box
        position="absolute"
        top="30%"
        left="25%"
        width="50%"
        height={5}
        borderStyle="rounded"
        title=" Delete Worktree "
        flexDirection="column"
        padding={1}
        backgroundColor="#1e1e1e"
      >
        <text fg="#ef4444">Cannot delete the main worktree</text>
        <text fg="#6b7280">Press Esc to dismiss</text>
      </box>
    );
  }

  return (
    <box
      position="absolute"
      top="30%"
      left="25%"
      width="50%"
      height={dirty ? 8 : 7}
      borderStyle="rounded"
      title=" Delete Worktree "
      flexDirection="column"
      padding={1}
      backgroundColor="#1e1e1e"
    >
      {dirty === null ? (
        <text fg="#6b7280">Checking worktree status...</text>
      ) : dirty ? (
        <>
          <text fg="#eab308">{`⚠ Worktree '${branchName}' has uncommitted changes`}</text>
          <text fg="#a3a3a3">Press D to force delete, Esc to cancel</text>
        </>
      ) : (
        <>
          <text fg="#e5e5e5">{`Delete worktree '${branchName}'?`}</text>
          <text fg="#a3a3a3">{`Branch: ${branchName} | Status: Clean`}</text>
          <text fg="#6b7280">{"\n  Enter confirm  Esc cancel"}</text>
        </>
      )}
      {error && <text fg="#ef4444">{`Error: ${error}`}</text>}
      {deleting && <text fg="#6b7280">Deleting...</text>}
    </box>
  );
}
