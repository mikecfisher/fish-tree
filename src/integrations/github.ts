/**
 * GitHub PR integration via `gh` CLI.
 * Gracefully returns null if gh is not installed or not authenticated.
 */

export interface PRInfo {
  number: number;
  title: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  reviewDecision:
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "REVIEW_REQUIRED"
    | null;
  ciStatus: "SUCCESS" | "FAILURE" | "PENDING" | null;
  url: string;
}

interface CacheEntry {
  data: PRInfo | null;
  timestamp: number;
}

const CACHE_TTL_MS = 60_000;
const prCache = new Map<string, CacheEntry>();

function cacheKey(branch: string, cwd: string): string {
  return `${cwd}:${branch}`;
}

function getCached(branch: string, cwd: string): PRInfo | null | undefined {
  const entry = prCache.get(cacheKey(branch, cwd));
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    prCache.delete(cacheKey(branch, cwd));
    return undefined;
  }
  return entry.data;
}

function setCache(branch: string, cwd: string, data: PRInfo | null): void {
  prCache.set(cacheKey(branch, cwd), { data, timestamp: Date.now() });
}

let ghAvailable: boolean | null = null;

export async function isGhAvailable(): Promise<boolean> {
  if (ghAvailable !== null) return ghAvailable;
  try {
    const result = await Bun.$`gh --version`.quiet();
    ghAvailable = result.exitCode === 0;
  } catch {
    ghAvailable = false;
  }
  return ghAvailable;
}

/** Reset cached gh availability (for testing). */
export function resetGhAvailability(): void {
  ghAvailable = null;
}

/** Clear all PR cache entries (for testing). */
export function clearPRCache(): void {
  prCache.clear();
}

function deriveCIStatus(
  statusCheckRollup: Array<{ state: string }> | null | undefined,
): PRInfo["ciStatus"] {
  if (!statusCheckRollup || statusCheckRollup.length === 0) return null;
  if (statusCheckRollup.some((c) => c.state === "FAILURE" || c.state === "ERROR")) return "FAILURE";
  if (statusCheckRollup.some((c) => c.state === "PENDING" || c.state === "EXPECTED")) return "PENDING";
  return "SUCCESS";
}

export async function getPRForBranch(
  branch: string,
  cwd: string,
): Promise<PRInfo | null> {
  if (!(await isGhAvailable())) return null;

  const cached = getCached(branch, cwd);
  if (cached !== undefined) return cached;

  try {
    const result =
      await Bun.$`gh pr view ${branch} --json number,title,state,reviewDecision,statusCheckRollup,url`
        .cwd(cwd)
        .quiet();

    if (result.exitCode !== 0) {
      setCache(branch, cwd, null);
      return null;
    }

    const raw = JSON.parse(result.stdout.toString());
    const pr: PRInfo = {
      number: raw.number,
      title: raw.title,
      state: raw.state,
      reviewDecision: raw.reviewDecision || null,
      ciStatus: deriveCIStatus(raw.statusCheckRollup),
      url: raw.url,
    };

    setCache(branch, cwd, pr);
    return pr;
  } catch {
    setCache(branch, cwd, null);
    return null;
  }
}
