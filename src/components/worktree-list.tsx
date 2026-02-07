import { useAppState } from "../state/store.ts";
import type { ListItem } from "../state/store.ts";
import type { Worktree, Project } from "../git/types.ts";

interface WorktreeListProps {
  compact: boolean;
}

export function WorktreeList({ compact }: WorktreeListProps) {
  const { state } = useAppState();

  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      title=" fish-tree "
      width={compact ? "100%" : "35%"}
      height="100%"
    >
      <scrollbox flexGrow={1} scrollY>
        <box flexDirection="column">
          {state.filteredItems.map((item, index) =>
            item.type === "project" ? (
              <ProjectHeader
                key={`p-${item.project.name}`}
                project={item.project}
                selected={index === state.selectedIndex}
                collapsed={state.collapsedProjects.has(item.project.name)}
              />
            ) : (
              <WorktreeRow
                key={`w-${item.worktree.path}`}
                worktree={item.worktree}
                selected={index === state.selectedIndex}
                compact={compact}
              />
            ),
          )}
        </box>
      </scrollbox>
    </box>
  );
}

interface ProjectHeaderProps {
  project: Project;
  selected: boolean;
  collapsed: boolean;
}

function ProjectHeader({ project, selected, collapsed }: ProjectHeaderProps) {
  const indicator = collapsed ? "◇" : "◆";
  const count = project.worktrees.length;

  return (
    <text
      fg={selected ? "#000000" : "#e5e5e5"}
      bg={selected ? "#61AFEF" : undefined}
    >
      {`${indicator} ${project.name} (${count})`}
    </text>
  );
}

interface WorktreeRowProps {
  worktree: Worktree;
  selected: boolean;
  compact: boolean;
}

function WorktreeRow({ worktree, selected, compact }: WorktreeRowProps) {
  const branchName = worktree.branch ?? "(detached)";
  const statusIcon = getStatusIcon(worktree);
  const statusColor = getStatusColor(worktree);
  const prefix = worktree.isMain ? "★ " : "  ";

  const label = compact
    ? `${prefix}${branchName} ${statusIcon}`
    : `${prefix}${branchName.padEnd(20)} ${statusIcon}`;

  return (
    <text
      fg={selected ? "#000000" : statusColor}
      bg={selected ? "#61AFEF" : undefined}
    >
      {label}
    </text>
  );
}

function getStatusIcon(wt: Worktree): string {
  if (wt.isDirty === true) return "●";
  if (wt.isDirty === false) return "✓";
  if (!wt.branch) return "~";
  return " ";
}

function getStatusColor(wt: Worktree): string {
  if (wt.isDirty === true) return "#eab308";
  if (wt.isDirty === false) return "#22c55e";
  if (!wt.branch) return "#ef4444";
  return "#a3a3a3";
}
