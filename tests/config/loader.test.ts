import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { join } from "path";
import { rmSync, mkdirSync } from "fs";
import { expandPath } from "../../src/config/paths";
import { DEFAULT_CONFIG, DEFAULT_STATE, type FishTreeConfig, type FishTreeState } from "../../src/config/schema";

let tempDir: string;

beforeEach(() => {
  tempDir = join(
    "/private/tmp",
    `fish-tree-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// ── expandPath ─────────────────────────────────────────────

describe("expandPath", () => {
  test("expands ~ to home directory", () => {
    const result = expandPath("~/foo");
    expect(result).toBe(join(process.env.HOME!, "foo"));
  });

  test("expands bare ~", () => {
    const result = expandPath("~");
    expect(result).toBe(process.env.HOME!);
  });

  test("leaves absolute paths unchanged", () => {
    const result = expandPath("/usr/local/bin");
    expect(result).toBe("/usr/local/bin");
  });

  test("leaves relative paths unchanged", () => {
    const result = expandPath("relative/path");
    expect(result).toBe("relative/path");
  });
});

// ── Config defaults ────────────────────────────────────────

describe("config defaults", () => {
  test("DEFAULT_CONFIG has expected shape", () => {
    expect(DEFAULT_CONFIG.worktreeBase).toBe("~/.worktrees");
    expect(DEFAULT_CONFIG.projects).toEqual([]);
    expect(DEFAULT_CONFIG.defaultBaseBranch).toBe("main");
    expect(DEFAULT_CONFIG.autoPrune).toBe(true);
    expect(DEFAULT_CONFIG.shell).toBe("auto");
  });

  test("DEFAULT_STATE has expected shape", () => {
    expect(DEFAULT_STATE.lastProject).toBeNull();
    expect(DEFAULT_STATE.lastWorktreePerProject).toEqual({});
    expect(DEFAULT_STATE.collapsedProjects).toEqual([]);
    expect(DEFAULT_STATE.viewMode).toBe("split");
  });
});

// ── Config load/save round-trip ────────────────────────────

describe("config load/save", () => {
  test("returns defaults when no config file exists", async () => {
    // Temporarily override env to use our temp dir
    const origXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(tempDir, "config");

    // Dynamically import to pick up the new env
    const { loadConfig } = await import("../../src/config/loader");
    const config = await loadConfig();

    expect(config.worktreeBase).toBe(DEFAULT_CONFIG.worktreeBase);
    expect(config.projects).toEqual(DEFAULT_CONFIG.projects);
    expect(config.defaultBaseBranch).toBe(DEFAULT_CONFIG.defaultBaseBranch);

    process.env.XDG_CONFIG_HOME = origXdg;
  });

  test("merges partial config with defaults", async () => {
    const configDir = join(tempDir, "config", "fish-tree");
    mkdirSync(configDir, { recursive: true });
    await Bun.write(
      join(configDir, "config.json"),
      JSON.stringify({ worktreeBase: "/custom/path", autoPrune: false }),
    );

    const origXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(tempDir, "config");

    const { loadConfig } = await import("../../src/config/loader");
    const config = await loadConfig();

    expect(config.worktreeBase).toBe("/custom/path");
    expect(config.autoPrune).toBe(false);
    // Defaults should fill in missing fields
    expect(config.defaultBaseBranch).toBe("main");
    expect(config.shell).toBe("auto");

    process.env.XDG_CONFIG_HOME = origXdg;
  });

  test("saveConfig creates directory if needed", async () => {
    const origXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = join(tempDir, "new-config");

    const { saveConfig, loadConfig } = await import("../../src/config/loader");
    const config: FishTreeConfig = {
      ...DEFAULT_CONFIG,
      worktreeBase: "/my/worktrees",
    };

    await saveConfig(config);

    // Should be able to load it back
    const loaded = await loadConfig();
    expect(loaded.worktreeBase).toBe("/my/worktrees");

    process.env.XDG_CONFIG_HOME = origXdg;
  });
});

// ── State load/save round-trip ─────────────────────────────

describe("state load/save", () => {
  test("returns defaults when no state file exists", async () => {
    const origXdg = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = join(tempDir, "state");

    const { loadState } = await import("../../src/config/loader");
    const state = await loadState();

    expect(state.lastProject).toBeNull();
    expect(state.lastWorktreePerProject).toEqual({});
    expect(state.collapsedProjects).toEqual([]);
    expect(state.viewMode).toBe("split");

    process.env.XDG_STATE_HOME = origXdg;
  });

  test("saveState round-trips correctly", async () => {
    const origXdg = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = join(tempDir, "new-state");

    const { saveState, loadState } = await import("../../src/config/loader");
    const state: FishTreeState = {
      lastProject: "my-project",
      lastWorktreePerProject: { "my-project": "/path/to/wt" },
      collapsedProjects: ["collapsed-proj"],
      viewMode: "compact",
    };

    await saveState(state);

    const loaded = await loadState();
    expect(loaded.lastProject).toBe("my-project");
    expect(loaded.lastWorktreePerProject).toEqual({ "my-project": "/path/to/wt" });
    expect(loaded.collapsedProjects).toEqual(["collapsed-proj"]);
    expect(loaded.viewMode).toBe("compact");

    process.env.XDG_STATE_HOME = origXdg;
  });
});
