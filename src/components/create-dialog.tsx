import { useState } from "react";
import { useKeyboard } from "@opentui/react";
import type { KeyEvent } from "@opentui/core";
import { useAppState } from "../state/store.ts";
import type { FishTreeConfig } from "../config/schema.ts";
import { expandPath } from "../config/paths.ts";
import { addWorktree } from "../git/worktree.ts";
import { listWorktrees } from "../git/worktree.ts";
import type { Project } from "../git/types.ts";

interface CreateDialogProps {
  config: FishTreeConfig;
}

export function CreateDialog({ config }: CreateDialogProps) {
  const { state, dispatch } = useAppState();
  const [branchName, setBranchName] = useState("");
  const [createNewBranch, setCreateNewBranch] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Determine which project to create in
  const item = state.filteredItems[state.selectedIndex];
  const project: Project | null =
    item?.type === "project"
      ? item.project
      : item?.type === "worktree"
        ? item.project
        : state.activeProject;

  useKeyboard((key: KeyEvent) => {
    if (key.name === "escape") {
      dispatch({ type: "SHOW_LIST" });
      return;
    }
    if (key.name === "tab") {
      setCreateNewBranch(!createNewBranch);
      return;
    }
  });

  async function handleSubmit(value: string) {
    if (!project || !value.trim()) return;
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const branch = value.trim();
    const basePath = `${expandPath(config.worktreeBase)}/${project.name}/${branch.replace(/\//g, "-")}`;

    const result = await addWorktree(project.gitDir, {
      basePath,
      branch,
      createBranch: createNewBranch,
    });

    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
      return;
    }

    // Refresh the project's worktree list
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

  return (
    <box
      position="absolute"
      top="25%"
      left="20%"
      width="60%"
      height={12}
      borderStyle="rounded"
      title=" New Worktree "
      flexDirection="column"
      padding={1}
      backgroundColor="#1e1e1e"
    >
      <text fg="#a3a3a3">
        {`Project: ${project?.name ?? "none"}`}
      </text>
      <text fg="#a3a3a3">
        {`Source:  ${createNewBranch ? "○ New branch" : "● Existing branch"}  (Tab to toggle)`}
      </text>
      <box flexDirection="row" height={1}>
        <text fg="#61AFEF">{"Branch: "}</text>
        <input
          focused
          value={branchName}
          placeholder="branch name..."
          onInput={(value: string) => setBranchName(value)}
          onSubmit={((value: string) => { handleSubmit(value); }) as any}
          flexGrow={1}
        />
      </box>
      {error && <text fg="#ef4444">{`Error: ${error}`}</text>}
      {submitting && <text fg="#6b7280">Creating...</text>}
      <text fg="#6b7280">{"\n  Enter create  Tab toggle mode  Esc cancel"}</text>
    </box>
  );
}
