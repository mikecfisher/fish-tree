import { useState, useEffect } from "react";
import { useAppState } from "../state/store.ts";
import type { Worktree, Project } from "../git/types.ts";

export function DetailPane() {
  const { state } = useAppState();
  const item = state.filteredItems[state.selectedIndex];

  if (!item || item.type !== "worktree") {
    return (
      <box
        flexGrow={1}
        borderStyle="rounded"
        title=" Detail "
        padding={1}
      >
        <text fg="#6b7280">Select a worktree to view details</text>
      </box>
    );
  }

  return (
    <WorktreeDetail
      worktree={item.worktree}
      project={item.project}
    />
  );
}

interface WorktreeDetailProps {
  worktree: Worktree;
  project: Project;
}

function WorktreeDetail({ worktree, project }: WorktreeDetailProps) {
  const [changes, setChanges] = useState<string[]>([]);
  const [commits, setCommits] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      try {
        const statusResult =
          await Bun.$`git -C ${worktree.path} status --porcelain`.text();
        if (!cancelled) {
          setChanges(
            statusResult
              .trim()
              .split("\n")
              .filter((l) => l.length > 0),
          );
        }
      } catch {
        if (!cancelled) setChanges([]);
      }

      try {
        const logResult =
          await Bun.$`git -C ${worktree.path} log --oneline -5`.text();
        if (!cancelled) {
          setCommits(
            logResult
              .trim()
              .split("\n")
              .filter((l) => l.length > 0),
          );
        }
      } catch {
        if (!cancelled) setCommits([]);
      }
    }

    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [worktree.path]);

  const branchName = worktree.branch ?? "(detached HEAD)";
  const statusLabel =
    worktree.isDirty === true
      ? "dirty"
      : worktree.isDirty === false
        ? "clean"
        : "unknown";
  const statusColor =
    worktree.isDirty === true
      ? "#eab308"
      : worktree.isDirty === false
        ? "#22c55e"
        : "#6b7280";

  return (
    <box
      flexGrow={1}
      borderStyle="rounded"
      title=" Detail "
      flexDirection="column"
      padding={1}
    >
      <scrollbox flexGrow={1} scrollY>
        <box flexDirection="column">
          <text fg="#e5e5e5">
            <b>{branchName}</b>
          </text>
          <text fg="#a3a3a3">{`project: ${project.name}`}</text>
          <text fg={worktree.isMain ? "#61AFEF" : "#a3a3a3"}>
            {`type: ${worktree.isMain ? "main worktree" : "worktree"}`}
          </text>
          <text fg={statusColor}>{`status: ${statusLabel}`}</text>
          <text fg="#a3a3a3">{`path: ${worktree.path}`}</text>
          <text fg="#a3a3a3">{`HEAD: ${worktree.head.slice(0, 7)}`}</text>
          {worktree.isLocked && <text fg="#ef4444">locked</text>}

          {changes.length > 0 && (
            <>
              <text fg="#6b7280">{"\n── Changed Files ──"}</text>
              {changes.map((line, i) => (
                <text key={i} fg="#a3a3a3">
                  {line}
                </text>
              ))}
            </>
          )}

          {commits.length > 0 && (
            <>
              <text fg="#6b7280">{"\n── Recent Commits ──"}</text>
              {commits.map((line, i) => (
                <text key={i} fg="#a3a3a3">
                  {line}
                </text>
              ))}
            </>
          )}
        </box>
      </scrollbox>
    </box>
  );
}
