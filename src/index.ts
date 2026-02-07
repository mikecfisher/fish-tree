#!/usr/bin/env bun
// fish-tree: git worktree management TUI + CLI

import {
  jumpToWorktree,
  quickAddWorktree,
  listWorktreesPlain,
  removeWorktreeCLI,
  openConfig,
  printHelp,
} from "./cli/commands";
import { launchTUI } from "./cli/launch-tui";
import { install } from "./shell/install";

const args = Bun.argv.slice(2);
const command = args[0];

switch (command) {
  case undefined:
  case "ui":
    await launchTUI();
    break;

  case "jump":
  case "j":
    await jumpToWorktree(args[1]);
    break;

  case "add":
  case "a":
    await quickAddWorktree(args.slice(1));
    break;

  case "list":
  case "ls":
    await listWorktreesPlain(args.slice(1));
    break;

  case "rm":
  case "remove":
    await removeWorktreeCLI(args.slice(1));
    break;

  case "config":
    await openConfig();
    break;

  case "install":
    await install(args.slice(1));
    break;

  case "--help":
  case "-h":
  case "help":
    printHelp();
    break;

  case "--version":
  case "-v": {
    const pkg = await Bun.file(
      new URL("../package.json", import.meta.url),
    ).json();
    console.log(pkg.version ?? "0.0.0");
    break;
  }

  default:
    // Unknown arg → treat as fuzzy jump target: ft <name>
    await jumpToWorktree(args[0]);
    break;
}
