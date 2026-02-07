import { useState, useEffect, useRef } from "react";
import type { Worktree } from "../git/types.ts";
import { isWorktreeDirty } from "../git/worktree.ts";

/** Batch size for concurrent dirty checks to avoid hammering git */
const BATCH_SIZE = 5;

/**
 * Lazy-loads dirty status for visible worktrees.
 * Returns a map of worktree path → isDirty.
 * Updates incrementally (doesn't block render).
 */
export function useGitStatus(worktrees: Worktree[]): Map<string, boolean> {
  const [statusMap, setStatusMap] = useState<Map<string, boolean>>(new Map());
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;

    async function loadStatuses() {
      // Only check worktrees that we haven't cached yet
      const toCheck = worktrees.filter((wt) => !statusMap.has(wt.path));
      if (toCheck.length === 0) return;

      // Process in batches
      for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
        if (cancelRef.current) return;
        const batch = toCheck.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(
          batch.map(async (wt) => ({
            path: wt.path,
            dirty: await isWorktreeDirty(wt.path),
          })),
        );

        if (cancelRef.current) return;
        setStatusMap((prev) => {
          const next = new Map(prev);
          for (const { path, dirty } of results) {
            next.set(path, dirty);
          }
          return next;
        });
      }
    }

    loadStatuses();
    return () => {
      cancelRef.current = true;
    };
  }, [worktrees]);

  return statusMap;
}
