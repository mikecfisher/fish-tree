import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { getConfigPath, getStatePath } from "./paths.ts";
import {
  DEFAULT_CONFIG,
  DEFAULT_STATE,
  type FishTreeConfig,
  type FishTreeState,
} from "./schema.ts";

/** Load config from disk, merging with defaults for missing fields */
export async function loadConfig(): Promise<FishTreeConfig> {
  const path = getConfigPath();
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return { ...DEFAULT_CONFIG };
    const raw = await file.json();
    return { ...DEFAULT_CONFIG, ...raw };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Save config to disk, creating directory if needed */
export async function saveConfig(config: FishTreeConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(config, null, 2) + "\n");
}

/** Load session state from disk, merging with defaults */
export async function loadState(): Promise<FishTreeState> {
  const path = getStatePath();
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return { ...DEFAULT_STATE };
    const raw = await file.json();
    return { ...DEFAULT_STATE, ...raw };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

/** Save session state to disk, creating directory if needed */
export async function saveState(state: FishTreeState): Promise<void> {
  const path = getStatePath();
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, JSON.stringify(state, null, 2) + "\n");
}
