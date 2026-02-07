/**
 * CI status integration — piggybacks on GitHub PR data.
 */

import { type PRInfo, getPRForBranch } from "./github";

export type CIStatus = "SUCCESS" | "FAILURE" | "PENDING" | null;

export interface CIDisplayInfo {
  status: CIStatus;
  icon: string;
  label: string;
  color: string;
}

export function formatCI(status: CIStatus): CIDisplayInfo {
  switch (status) {
    case "SUCCESS":
      return { status, icon: "\u2713", label: "CI passing", color: "#98C379" };
    case "FAILURE":
      return { status, icon: "\u2717", label: "CI failing", color: "#E06C75" };
    case "PENDING":
      return { status, icon: "\u23F3", label: "CI pending", color: "#E5C07B" };
    case null:
      return { status, icon: "", label: "", color: "" };
  }
}

export async function getCIStatus(
  branch: string,
  cwd: string,
): Promise<CIDisplayInfo> {
  const pr = await getPRForBranch(branch, cwd);
  if (!pr) return formatCI(null);
  return formatCI(pr.ciStatus);
}

export function getCIStatusFromPR(pr: PRInfo | null): CIDisplayInfo {
  if (!pr) return formatCI(null);
  return formatCI(pr.ciStatus);
}
