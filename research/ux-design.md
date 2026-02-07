# fish-tree UX Design Proposal

## Executive Summary

fish-tree is a git worktree management TUI built with OpenTUI (React bindings) + Bun. This document proposes a keyboard-driven, lazygit-inspired interface with a project-first navigation model, contextual detail panels, and fast worktree operations accessible through single-keypress actions.

**Design principles:**
1. **Speed over discovery** — Power users navigate worktrees constantly; optimize for muscle memory
2. **Context at a glance** — Show branch state, dirty files, last commit, and linked PR without navigating
3. **Progressive disclosure** — Simple list view by default, detail panels on demand
4. **Consistent with the ecosystem** — Vim-style navigation (j/k), lazygit-style panels, yazi-style Miller columns for project > worktree > detail drilling

---

## 1. Information Architecture

### Data Model (what the user manages)

```
~/.worktrees/
  ├── my-app/
  │   ├── main/          ← worktree (branch: main)
  │   ├── feat-auth/     ← worktree (branch: feat/auth)
  │   └── fix-typo/      ← worktree (branch: fix/typo)
  └── api-server/
      ├── main/
      └── refactor-db/
```

### Hierarchy

```
Projects → Worktrees → Detail (files, commits, PR)
```

The user's mental model: "I have projects. Each project has worktrees. I want to switch between them fast."

---

## 2. Screen Layouts

### 2a. Main View — Split Panel Layout

The primary view uses a two-panel layout inspired by lazygit's pane system, with an optional third detail pane that appears contextually.

```
┌─ fish-tree ──────────────────────────────────────────────────────────┐
│ ◆ my-app (3)                    │                                    │
│   api-server (2)                │  feat-auth                         │
│   dotfiles (1)                  │  branch: feat/auth                 │
│                                 │  status: 3 modified, 1 staged      │
│                                 │  last commit: 2h ago — Add login   │
│                                 │  PR: #142 (review requested)       │
│                                 │  created: 3 days ago               │
│                                 │                                    │
│                                 │  ── Changed Files ──               │
│                                 │  M src/auth/login.ts               │
│                                 │  M src/auth/session.ts             │
│                                 │  M tests/auth.test.ts              │
│                                 │  A src/auth/oauth.ts               │
│                                 │                                    │
│                                 │  ── Recent Commits ──              │
│                                 │  abc1234 Add login endpoint        │
│                                 │  def5678 Add session middleware    │
│                                 │  ghi9012 Initial auth scaffold     │
│                                 │                                    │
├─────────────────────────────────┴────────────────────────────────────┤
│ j/k navigate  enter switch  n new  d delete  / search  ? help  q quit│
└──────────────────────────────────────────────────────────────────────┘
```

**Left panel: Project + Worktree List (unified tree)**
- Projects shown as collapsible groups with worktree count
- Active project is expanded, others collapsed
- Selected project marker: `◆` (filled), unselected: `◇`
- Worktrees indented under their project
- Color coding:
  - Green: clean worktree
  - Yellow: dirty (uncommitted changes)
  - Red: conflicts or detached HEAD
  - Dim: stale (no commits in 30+ days)

**Right panel: Detail Pane**
- Shows details for the currently highlighted worktree
- Sections: branch info, status summary, changed files, recent commits
- Scrollable independently from the left panel
- Updates instantly as cursor moves in the left panel

**Bottom bar: Context-sensitive keybinding hints**
- Always visible, adapts to current focus and state
- Shows the most common actions; `?` reveals full help

### 2b. Expanded View — Three-Column Miller Layout

Activated by pressing `l` (right) or `Tab` to drill into the detail pane, enabling file browsing or commit inspection.

```
┌─ fish-tree ──────────────────────────────────────────────────────────┐
│ Projects       │ my-app worktrees  │ feat-auth detail                 │
│                │                   │                                  │
│ ◆ my-app (3)  │ ◆ feat-auth   ●  │  branch: feat/auth               │
│   api-server   │   main         ✓  │  status: 3M 1A                   │
│   dotfiles     │   fix-typo     ✓  │                                  │
│                │                   │  M src/auth/login.ts              │
│                │                   │  M src/auth/session.ts            │
│                │                   │  M tests/auth.test.ts             │
│                │                   │  A src/auth/oauth.ts              │
│                │                   │                                  │
│                │                   │  abc1234 Add login endpoint       │
│                │                   │  def5678 Add session middleware   │
│                │                   │                                  │
├────────────────┴───────────────────┴──────────────────────────────────┤
│ h/l columns  j/k navigate  enter switch  n new  ? help  q quit       │
└──────────────────────────────────────────────────────────────────────┘
```

This three-column view is **optional** — the two-panel layout is the default. Power users who prefer yazi-style drilling can enable this via config or `Tab` to toggle.

### 2c. Compact View — Single List

For small terminals or users who prefer minimal UI. Toggled with `1` key.

```
┌─ fish-tree ──────────────────────────────────────────────────────────┐
│                                                                      │
│  my-app                                                              │
│    ◆ feat-auth     ● 3M 1A   2h ago   PR #142                       │
│      main          ✓         1d ago                                  │
│      fix-typo      ✓         5d ago                                  │
│                                                                      │
│  api-server                                                          │
│    refactor-db     ● 1M      4h ago   PR #89                        │
│    main            ✓         2d ago                                  │
│                                                                      │
│  dotfiles                                                            │
│    main            ✓         1w ago                                  │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ j/k navigate  enter switch  n new  d delete  / search  ? help        │
└──────────────────────────────────────────────────────────────────────┘
```

**Inline status indicators:**
- `✓` = clean
- `●` = dirty (with summary like `3M 1A`)
- `!` = conflicts
- `~` = detached HEAD

---

## 3. Keybindings

### Design Philosophy

Follow lazygit's approach: **single-key actions for common operations**, modifier keys for destructive actions. Vim-style navigation as the primary mode, with arrow keys as alternatives.

### Global Keybindings

| Key | Action | Notes |
|-----|--------|-------|
| `j` / `↓` | Move cursor down | |
| `k` / `↑` | Move cursor up | |
| `h` / `←` | Collapse / move to parent column | In Miller view: move left |
| `l` / `→` | Expand / move to detail column | In Miller view: move right |
| `g` `g` | Jump to top | Vim-style double-tap |
| `G` | Jump to bottom | |
| `J` / `K` | Move between projects (skip worktrees) | Fast project switching |
| `Tab` | Toggle detail pane / cycle focus | |
| `1` / `2` / `3` | Switch view mode (compact/split/miller) | |
| `/` | Fuzzy search/filter | Filters across all projects + worktrees |
| `Esc` | Cancel / close overlay / clear filter | |
| `?` | Show full help overlay | |
| `q` | Quit | Outputs selected path to stdout for `cd` |

### Worktree Actions

| Key | Action | Notes |
|-----|--------|-------|
| `Enter` | Switch to worktree | Quits TUI, outputs path for fish `cd` |
| `n` | New worktree | Opens creation dialog |
| `d` | Delete worktree | Requires confirmation; warns if dirty |
| `D` | Force delete worktree | Skips safety checks |
| `r` | Rename worktree directory | |
| `f` | Fetch origin for this worktree | |
| `p` | Pull in this worktree | |
| `c` | Open new Claude Code session in worktree | Integration hook |
| `e` | Open in $EDITOR | |
| `t` | Open in new terminal tab/tmux pane | |
| `o` | Open in Finder / file manager | |

### Project Actions

| Key | Action | Notes |
|-----|--------|-------|
| `a` | Add/register a new project | Points to a bare repo or repo root |
| `A` | Auto-discover projects | Scans common directories |
| `x` | Remove project from fish-tree | Doesn't delete worktrees |
| `Space` | Collapse/expand project group | |

### Overlay/Dialog Keybindings

| Key | Action | Notes |
|-----|--------|-------|
| `Enter` | Confirm | |
| `Esc` | Cancel | |
| `Tab` | Next field | In multi-field dialogs |
| `Shift+Tab` | Previous field | |

---

## 4. Core Workflows

### 4a. Switching to a Worktree (primary action)

This is the #1 workflow. Must be as fast as possible.

**Flow:**
1. Launch `fish-tree` (or `ft` alias)
2. Cursor is on the last-used worktree (remembered)
3. Press `j`/`k` to navigate, or `/` to fuzzy search
4. Press `Enter`
5. TUI exits, outputs path to stdout
6. Fish wrapper runs `cd` to that path

**Speed optimization:** If the user knows the branch name, they can type `ft feat-auth` as a CLI argument for instant switching without the TUI:
```
ft feat-auth  →  cd ~/.worktrees/my-app/feat-auth
```

If ambiguous (branch exists in multiple projects), show a disambiguation picker.

### 4b. Creating a New Worktree

**Flow:**
1. Press `n` from any view
2. Dialog appears:

```
┌─ New Worktree ───────────────────────────────────────┐
│                                                       │
│  Project:  my-app                    (auto-detected)  │
│                                                       │
│  Source:   ○ New branch from...                       │
│            ● Existing branch                          │
│            ○ From GitHub PR                           │
│            ○ From GitHub issue                        │
│                                                       │
│  Branch:   feat/auth█                 (fuzzy search)  │
│                                                       │
│  ── Matching branches ──                              │
│    feat/auth-flow                                     │
│    feat/auth-tests                                    │
│    feat/authorization                                 │
│                                                       │
│                          [Cancel]  [Create]           │
└───────────────────────────────────────────────────────┘
```

3. Select source type (new branch, existing branch, PR, issue)
4. Type branch name with fuzzy autocomplete
5. For "New branch from..." → additional base branch picker
6. Press `Enter` to create
7. Worktree is created, cursor moves to it
8. Optional: press `Enter` again to switch to it immediately

**Smart defaults:**
- Project is auto-detected from current cursor position
- "Existing branch" is pre-selected if remote branches exist
- Branch name input has fuzzy search over remote + local branches

### 4c. Deleting a Worktree

**Flow:**
1. Highlight worktree, press `d`
2. If clean:
```
┌─ Delete Worktree ────────────────────────────┐
│                                               │
│  Delete worktree 'feat-auth'?                 │
│                                               │
│  Branch: feat/auth                            │
│  Status: Clean (no uncommitted changes)       │
│                                               │
│  □ Also delete the branch                     │
│                                               │
│                     [Cancel]  [Delete]         │
└───────────────────────────────────────────────┘
```

3. If dirty:
```
┌─ Delete Worktree ─────── ⚠ WARNING ─────────┐
│                                               │
│  Worktree 'feat-auth' has uncommitted changes │
│                                               │
│  3 modified files, 1 staged file              │
│                                               │
│  Are you sure? This cannot be undone.         │
│                                               │
│  Press D to force delete, Esc to cancel       │
│                                               │
└───────────────────────────────────────────────┘
```

### 4d. Fuzzy Search

**Flow:**
1. Press `/`
2. Search bar appears at top, list filters in real-time
3. Searches across: project names, branch names, worktree directory names
4. Results ranked by: recency > match quality > alphabetical

```
┌─ fish-tree ──────────────────────────────────────────────────────────┐
│  Search: auth█                                                       │
├──────────────────────────────────────────────────────────────────────┤
│  my-app                                                              │
│    ◆ feat-auth       ● 3M 1A   2h ago   PR #142                     │
│  api-server                                                          │
│    auth-refactor     ✓         1d ago                                │
│                                                                      │
│  2 matches                                                           │
├──────────────────────────────────────────────────────────────────────┤
│ ↑/↓ navigate  enter switch  esc clear                                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Status Information Per Worktree

### Inline (in list view)
| Indicator | Meaning |
|-----------|---------|
| `✓` | Clean — no uncommitted changes |
| `●` | Dirty — has uncommitted changes |
| `●3M 1A` | Dirty with summary: 3 modified, 1 added |
| `!` | Has merge conflicts |
| `~` | Detached HEAD |
| `⏳` | Operation in progress (rebase, merge) |
| Dim text | Stale — no activity in 30+ days |

### Detail Pane (full info)
- **Branch name** — full ref (e.g., `feat/auth`)
- **Tracking branch** — e.g., `origin/feat/auth` with ahead/behind counts
- **Dirty state** — modified, staged, untracked counts
- **Last commit** — hash, message, relative time (e.g., "2h ago")
- **Linked PR** — number, title, status (open/draft/review requested/merged)
- **CI status** — passing/failing/pending (if available via gh)
- **Created** — when the worktree was created
- **Stale indicator** — flag if no commits in 30+ days

### Color Coding
- **Green** `#22c55e` — clean, CI passing, PR approved
- **Yellow** `#eab308` — dirty, CI pending, PR has requested changes
- **Red** `#ef4444` — conflicts, CI failing, PR blocked
- **Dim/Gray** `#6b7280` — stale, archived, inactive
- **Blue** `#3b82f6` — currently checked out (in another terminal)
- **Cyan** `#06b6d4` — PR-related info

---

## 6. Onboarding — First Run Experience

### Scenario: No worktrees exist yet

```
┌─ fish-tree ──────────────────────────────────────────────────────────┐
│                                                                      │
│                                                                      │
│                     Welcome to fish-tree!                             │
│                                                                      │
│           A fast way to manage git worktrees across projects.        │
│                                                                      │
│                                                                      │
│           Get started:                                               │
│                                                                      │
│           a   Add an existing git repository                         │
│           A   Auto-discover repos in common locations                │
│           ?   Learn more about worktrees                             │
│                                                                      │
│                                                                      │
│           Tip: fish-tree works best with bare repositories.          │
│           Run `git clone --bare <url>` to create one.                │
│                                                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ a add repo  A auto-discover  ? help  q quit                          │
└──────────────────────────────────────────────────────────────────────┘
```

### Scenario: Adding first project

```
┌─ Add Project ────────────────────────────────────────┐
│                                                       │
│  Repository path: ~/dev/my-app█                       │
│                                                       │
│  ── Detected Repositories ──                          │
│    ~/dev/my-app           (bare repo, 12 branches)    │
│    ~/dev/my-app.git       (bare repo, 12 branches)    │
│    ~/dev/api-server       (regular repo, 5 branches)  │
│                                                       │
│  ⓘ Regular repos will be converted to use worktrees.  │
│    Your existing working directory becomes a worktree. │
│                                                       │
│                          [Cancel]  [Add]              │
└───────────────────────────────────────────────────────┘
```

### Auto-Discovery (`A`)

Scans `~/dev`, `~/projects`, `~/code`, `~/repos`, and `~/src` for git repositories. Shows results with repo type and branch count. User selects which to add.

---

## 7. Multi-Project UX

### Project Switching

Projects are always visible in the left panel. Two navigation modes:

1. **Flat navigation** (default): `j`/`k` moves through all items (projects and worktrees) sequentially. Projects act as collapsible headers.

2. **Project-jump navigation**: `J`/`K` jumps between project headers, skipping worktrees. Useful when managing many projects.

### Project Context

The active project is highlighted with `◆` and expanded. Inactive projects show with `◇` and can be collapsed with `Space` to save vertical space.

### Project-Scoped Actions

When a project header is selected (not a worktree):
- `Enter` → expand/collapse the project
- `n` → create worktree in this project
- `f` → fetch all for this project
- `x` → remove project from fish-tree
- `i` → show project info (remote URL, total worktrees, disk usage)

### Global vs. Scoped Search

- `/` → search across all projects
- `.` → search within current project only

---

## 8. OpenTUI Component Mapping

### How this maps to OpenTUI components

| UI Element | OpenTUI Component | Notes |
|-----------|-------------------|-------|
| Main layout | `<box flexDirection="row">` | Two-column split |
| Project/worktree list | `<box>` + custom `<select>` | Tree-like list with groups |
| Detail pane | `<box>` with `<scrollBox>` | Scrollable detail content |
| Status bar (bottom) | `<box>` with `<text>` | Fixed height at bottom |
| Search input | `<input>` | With fuzzy matching logic |
| Dialogs/overlays | `<box>` with absolute positioning | Centered overlay pattern |
| Tab bar (view modes) | `<tabSelect>` | For switching between views |
| File list in detail | `<select>` or custom list | Syntax-highlighted paths |
| Commit log | `<scrollBox>` with `<text>` | Styled commit entries |
| Help overlay | `<box>` with `<scrollBox>` | Full keybinding reference |

### React Component Hierarchy

```tsx
<App>
  <box flexDirection="column" width="100%" height="100%">
    {/* Header - optional, minimal */}
    <Header />

    {/* Main content area */}
    <box flexDirection="row" flexGrow={1}>
      {/* Left panel: project + worktree tree */}
      <ProjectList width="35%" />

      {/* Right panel: detail view */}
      <DetailPane flexGrow={1} />
    </box>

    {/* Bottom status bar */}
    <StatusBar height={1} />
  </box>

  {/* Overlay dialogs (conditionally rendered) */}
  {showNewWorktreeDialog && <NewWorktreeDialog />}
  {showDeleteConfirm && <DeleteConfirmDialog />}
  {showHelp && <HelpOverlay />}
  {showSearch && <SearchOverlay />}
</App>
```

### Focus Management Strategy

OpenTUI provides built-in focus management. The strategy:

1. **Left panel** is focused by default
2. `Tab` or `l` moves focus to detail pane
3. `h` or `Shift+Tab` returns focus to left panel
4. Dialogs capture focus when open, return on close
5. Search input captures focus when `/` is pressed
6. `Esc` always returns focus to the left panel

---

## 9. Visual Design Details

### Border Style

Use OpenTUI's `rounded` border style for all panels — modern and clean.

### Typography / Text Styling

- **Project names**: Bold, slightly brighter
- **Worktree names**: Normal weight
- **Status indicators**: Colored per the color coding above
- **Timestamps**: Dim gray
- **PR/CI info**: Colored per status
- **Selected item**: Inverted background (highlight bar)
- **Focused panel**: Bright border color
- **Unfocused panel**: Dim border color

### Density

Default to "comfortable" density with 1 line per worktree in list view. Offer "compact" mode (no spacing between items) for users with many worktrees.

### Responsive Layout

- **< 80 cols**: Auto-switch to compact (single-column) view
- **80-120 cols**: Default split view (35/65 ratio)
- **> 120 cols**: Split view with wider detail pane, or Miller columns

---

## 10. Advanced Features

### 10a. Batch Operations

Select multiple worktrees with `v` (visual select mode, like vim):
- `v` toggles selection on current item
- `V` selects all worktrees in current project
- With selection active:
  - `d` → delete all selected
  - `f` → fetch all selected
  - `p` → pull all selected

### 10b. Stale Worktree Cleanup

Press `P` (prune) to show a dialog listing all stale/merged worktrees:

```
┌─ Cleanup Stale Worktrees ────────────────────────────┐
│                                                       │
│  The following worktrees appear stale or merged:      │
│                                                       │
│  ☑ my-app/fix-typo      merged 5d ago                │
│  ☑ my-app/old-feature   no commits in 45 days        │
│  ☐ api-server/test-ci   merged 1d ago                │
│                                                       │
│  Select worktrees to remove:                          │
│  ☑ = will be deleted  ☐ = will be kept                │
│                                                       │
│                     [Cancel]  [Clean Up]              │
└───────────────────────────────────────────────────────┘
```

### 10c. Quick Switch (no TUI)

For maximum speed, support CLI-only switching:

```bash
ft auth          # fuzzy match → cd to best match
ft my-app main   # exact → cd to ~/.worktrees/my-app/main
ft -             # switch to previous worktree (like cd -)
ft --list        # print all worktrees as plain text
```

### 10d. Session Memory

fish-tree remembers:
- Last selected worktree per project (cursor position on launch)
- Last active project
- Collapsed/expanded state of project groups
- View mode preference (compact/split/miller)
- Window size and panel ratio

Stored in `~/.config/fish-tree/state.json`.

### 10e. Notifications / Badges

On launch, surface important info:
- Worktrees with merge conflicts
- PRs that got approved since last check
- CI failures
- Worktrees where `origin` is ahead (needs pull)

Show these as a subtle count badge in the status bar:

```
│ ⚠ 2 conflicts  ✓ 1 PR approved  ↓ 3 behind origin                   │
```

---

## 11. Competitive Analysis Summary

| Feature | lazyworktree | forestui | claude-worktree | **fish-tree** |
|---------|-------------|----------|-----------------|---------------|
| Multi-project | No | Yes | No | **Yes** |
| Detail pane | Yes (3 panes) | No | No | **Yes** |
| Fuzzy search | Yes | No | Yes | **Yes** |
| PR integration | Yes (CI too) | No | No | **Yes** |
| Editor integration | Yes | Yes (tmux) | No | **Yes** |
| Claude Code integration | No | Yes | Yes | **Yes** |
| Batch operations | No | No | No | **Yes** |
| Stale cleanup | Yes (prune) | Yes (archive) | No | **Yes** |
| Fish shell native | No | No | No | **Yes** |
| OpenTUI/React | No (BubbleTea) | No (Textual) | No (ratatui) | **Yes** |

### Key Differentiators

1. **Multi-project first**: Unlike lazyworktree (single repo), fish-tree manages worktrees across all your projects
2. **Rich detail pane**: More context at a glance than any existing tool
3. **Fish shell integration**: Native cd-on-exit via fish wrapper
4. **OpenTUI**: React-based TUI means rapid iteration and familiar component model
5. **CLI + TUI hybrid**: Quick `ft <name>` switching without opening the TUI

---

## 12. Implementation Priority

### Phase 1 — Core (MVP)
1. Project list with worktree tree view (left panel)
2. Basic detail pane (branch, status, last commit)
3. Navigation (j/k/enter/q)
4. Worktree switching (cd-on-exit)
5. Fuzzy search (`/`)
6. Status bar with keybinding hints

### Phase 2 — CRUD
7. Create worktree dialog
8. Delete worktree with confirmation
9. Add/remove projects
10. Auto-discovery of repos

### Phase 3 — Rich Context
11. PR integration (via `gh`)
12. CI status display
13. Changed files list in detail pane
14. Commit log in detail pane

### Phase 4 — Power Features
15. Batch operations
16. Stale worktree cleanup
17. Editor/terminal/Claude Code integration
18. Miller column view
19. Session memory
20. Notifications/badges

---

## Appendix A: Full Keybinding Reference

### Navigation
| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `h` / `←` | Collapse / left column |
| `l` / `→` | Expand / right column |
| `g` `g` | Jump to top |
| `G` | Jump to bottom |
| `J` | Next project |
| `K` | Previous project |
| `Tab` | Cycle panel focus |
| `Space` | Collapse/expand project |
| `1` / `2` / `3` | View: compact / split / miller |

### Worktree Actions
| Key | Action |
|-----|--------|
| `Enter` | Switch to worktree (cd) |
| `n` | New worktree |
| `d` | Delete worktree |
| `D` | Force delete |
| `r` | Rename |
| `f` | Fetch |
| `p` | Pull |
| `e` | Open in $EDITOR |
| `t` | Open in terminal |
| `c` | Open Claude Code session |
| `o` | Open in file manager |

### Project Actions
| Key | Action |
|-----|--------|
| `a` | Add project |
| `A` | Auto-discover projects |
| `x` | Remove project |
| `i` | Project info |

### Selection
| Key | Action |
|-----|--------|
| `v` | Toggle select current |
| `V` | Select all in project |

### Global
| Key | Action |
|-----|--------|
| `/` | Search (all projects) |
| `.` | Search (current project) |
| `P` | Prune stale worktrees |
| `?` | Help |
| `Esc` | Cancel / clear |
| `q` | Quit |

## Appendix B: Config File Structure

```toml
# ~/.config/fish-tree/config.toml

[general]
default_view = "split"     # "compact" | "split" | "miller"
vim_keys = true             # false for arrow-only navigation
stale_threshold_days = 30
auto_fetch_on_open = false

[projects]
scan_dirs = ["~/dev", "~/projects"]

[appearance]
theme = "auto"              # "dark" | "light" | "auto"
density = "comfortable"     # "compact" | "comfortable"
show_pr_info = true
show_ci_status = true

[integrations]
editor = "$EDITOR"          # or explicit: "nvim", "code", etc.
terminal = "auto"           # "kitty", "wezterm", "tmux", "auto"
claude_code = true

[keybindings]
# Override any default keybinding
# switch = "enter"
# new = "n"
# delete = "d"
```
