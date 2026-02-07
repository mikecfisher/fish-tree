import { useState, useEffect, useCallback } from "react";
import type { Project, Worktree } from "../git/types.ts";
import { listWorktrees } from "../git/worktree.ts";

interface UseWorktreesResult {
  worktrees: Map<string, Worktree[]>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches worktrees for all given projects.
 * Returns a map of gitDir → Worktree[].
 */
export function useWorktrees(projects: Project[]): UseWorktreesResult {
  const [worktrees, setWorktrees] = useState<Map<string, Worktree[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const results = new Map<string, Worktree[]>();
      let firstError: string | null = null;

      await Promise.all(
        projects.map(async (project) => {
          const result = await listWorktrees(project.gitDir);
          if (cancelled) return;
          if (result.ok) {
            results.set(project.gitDir, result.value);
          } else if (!firstError) {
            firstError = result.error.message;
          }
        }),
      );

      if (cancelled) return;
      setWorktrees(results);
      setError(firstError);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [projects, refreshKey]);

  return { worktrees, loading, error, refresh };
}
