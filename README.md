# fish-tree

A terminal UI and CLI for managing git worktrees across multiple repositories.

If you use git worktrees heavily, you've probably lost track of which ones exist, forgotten to clean up stale ones, or just gotten tired of typing long paths. fish-tree gives you a single interface to see everything, jump between worktrees, and create or remove them without remembering the git commands.

## What it does

- **TUI browser** -- interactive list of all your worktrees, grouped by project, with dirty/clean status and recent commits
- **Fuzzy jump** -- type `ft auth` and land in whichever worktree matches "auth"
- **Quick create/delete** -- `ft add feat/login` or `ft rm feat/login` without thinking about paths
- **Shell integration** -- `ft` can `cd` you into worktrees directly (fish, bash, zsh)
- **Multi-project** -- discovers repos automatically from a configurable base directory, or you can list them explicitly in config

## Install

Requires [Bun](https://bun.sh) (v1.0+). This won't work with Node.

```sh
bun install -g fish-tree
```

Then set up the shell wrapper so `ft` can `cd` you into worktrees:

```sh
ft install       # auto-detects your shell
ft install --all # fish + bash + zsh
```

Restart your shell (or `source` the relevant rc file) and you're good to go.

## Usage

```
ft                  Open the TUI
ft <name>           Fuzzy jump to a worktree (shorthand for ft jump)
ft add <branch>     Create a new worktree
ft list             List all worktrees (plain text)
ft list --json      List all worktrees (JSON)
ft rm <name>        Remove a worktree
ft config           Open config in $EDITOR
ft install          Install shell wrapper
```

### TUI keybindings

| Key | Action |
|-----|--------|
| `j` / `k` | Move up/down |
| `Enter` | Open worktree (cd) or toggle project |
| `Space` | Toggle project collapsed/expanded |
| `n` | Create new worktree |
| `d` | Delete selected worktree |
| `/` | Filter worktrees |
| `g` / `G` | Jump to top/bottom |
| `q` | Quit |

The main worktree (root repo checkout) is marked with a star in the sidebar and can't be deleted from the TUI.

## Configuration

Config lives at `~/.config/fish-tree/config.json` (or wherever `XDG_CONFIG_HOME` points). Run `ft config` to open it.

```json
{
  "worktreeBase": "~/.worktrees",
  "projects": [
    { "name": "my-app", "path": "/Users/me/code/my-app" }
  ],
  "defaultBaseBranch": "main",
  "autoPrune": true,
  "shell": "auto"
}
```

- **worktreeBase** -- directory where new worktrees get created, organized by project name
- **projects** -- explicitly registered repos (fish-tree also auto-discovers repos under `worktreeBase`)
- **defaultBaseBranch** -- branch used as the starting point when creating worktrees
- **autoPrune** -- automatically prune stale worktree references
- **shell** -- `"auto"`, `"fish"`, `"bash"`, or `"zsh"`

## Running tests

```sh
bun test
```

## Built with

- [Bun](https://bun.sh) -- runtime, bundler, test runner
- [OpenTUI](https://github.com/anthropics/opentui) -- React-based terminal UI framework
- [React](https://react.dev) -- component model and state management
