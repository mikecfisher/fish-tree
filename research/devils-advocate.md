# Devil's Advocate: fish-tree Risk Assessment

## Executive Summary

fish-tree enters a **crowded and rapidly growing space** of git worktree management tools. At least 7 active competitors exist (LazyWorktree, Worktrunk, gwq, worktree-cli, wtp, branchlet, gwt). The strongest differentiation opportunities lie in **shell-native UX and opinionated simplicity**, but several foundational assumptions carry significant risk. This report rates 14 risks across 8 categories.

---

## 1. OpenTUI Risks

**Severity: HIGH**

### 1.1 Pre-1.0 Instability (HIGH)

OpenTUI is at v0.1.77 with 52 open issues. The README explicitly states: *"It is currently in development and is not ready for production use."*

**Real issues from GitHub (github.com/anomalyco/opentui/issues):**
- **Rendering bugs**: CJK/multi-byte text corruption (#609), Thai text corruption during scrolling (#479), nested text elements missing (#438)
- **Performance**: `Bun.spawn()` into an editor is "extremely slow and drops inputs" (#564) — this is directly relevant to fish-tree if it shells out to editors
- **ScrollBox breaking** with long content (#560) — would affect any list view of worktrees in large repos
- **Platform issues**: Windows compatibility problems (#514), tmux integration causing random hex codes (#490)
- **Extensibility**: Core renderables have restrictive private properties (#510), limiting customization
- **Input handling**: Word boundary bugs (#596), input component defaults to height 0 (#451)

**What this means for fish-tree:**
- Any TUI built on OpenTUI inherits all these bugs
- CJK text issues affect branch names with non-ASCII characters (common in international teams)
- The tmux issue (#490) is a showstopper — many developers live in tmux
- No 1.0 roadmap exists; the project could stall or make breaking API changes at any time

**Mitigations:**
- Pin to a specific OpenTUI version and test against it exhaustively
- Abstract the UI layer behind an interface so the rendering backend can be swapped (e.g., to Ink or raw ANSI)
- Contribute fixes upstream for critical bugs (tmux, scrollbox)
- Have a "degraded mode" that falls back to plain CLI output when TUI rendering fails
- Monitor OpenTUI's release cadence as a canary for project health

### 1.2 Ecosystem Lock-in (MEDIUM)

OpenTUI uses React bindings but is not React — it's its own renderer. Code written for OpenTUI cannot be ported to Ink (the established React-in-terminal library) or vice versa.

**Mitigation:** Keep UI components thin. Business logic should never import from OpenTUI. If OpenTUI dies, only the view layer needs rewriting.

---

## 2. Bun Runtime Risks

**Severity: MEDIUM-HIGH**

### 2.1 Distribution & Installation Friction (HIGH)

**The core problem:** fish-tree requires Bun to be installed. How do users get it?

Options and their issues:

| Distribution Method | Problem |
|---|---|
| `bun install -g fish-tree` | Requires Bun already installed |
| `npx fish-tree` | NPX + Bun binaries = 422 MB package for cross-platform |
| `brew install fish-tree` | macOS only, requires Homebrew maintainers to accept |
| `bun build --compile` | Produces ~57 MB single-platform binary; cross-compile adds complexity |
| curl install script | Security concerns, nonstandard |

**The `bun build --compile` option is the most promising** but has caveats:
- Binaries are ~57 MB each (Bun runtime embedded)
- Cross-compilation works but requires building for each target
- No native `bun publish` command — you need npm to publish to npm

**Comparison:** LazyWorktree (Go) compiles to ~10 MB binaries. Worktrunk (Rust) compiles to ~5 MB. gwq (Go) compiles to ~8 MB. A 57 MB binary for a worktree manager is hard to justify.

**Mitigations:**
- Use `bun build --compile` for GitHub Releases with per-platform binaries
- Accept the 57 MB tradeoff for v1; optimize later
- Provide a `curl | sh` installer that detects platform and downloads the right binary
- Also publish to npm for users who already have Bun/Node
- Consider: is Bun actually necessary? Could this be written in Go/Rust and be 10x smaller?

### 2.2 Bun-Specific API Instability (LOW-MEDIUM)

Bun's APIs are mostly stable in 2026, but edge cases exist. `Bun.spawn()` has known issues in OpenTUI (#564). Shell integration (`Bun.$`) is convenient but may have platform-specific quirks.

**Mitigation:** Stick to Node.js-compatible APIs where possible. Use Bun-specific APIs only where they provide clear value.

---

## 3. Centralized ~/.worktrees/ Directory

**Severity: HIGH**

### 3.1 IDE and Tooling Confusion (HIGH)

Storing worktrees at `~/.worktrees/<project>/<branch>/` breaks several assumptions:

- **VS Code / JetBrains**: These IDEs discover git repos by walking up the directory tree looking for `.git`. A worktree at `~/.worktrees/myapp/feature-x/` has a `.git` *file* (not directory) pointing back to the original repo. Some IDEs handle this poorly, especially:
  - JetBrains has documented issues with git through symlinks
  - TortoiseGit may not recognize the directory as a git repo
  - Extensions that assume `.git` is a directory will break

- **`node_modules` and dependencies**: Each worktree needs its own `node_modules/`. For a large project, that's potentially gigabytes per worktree. Users at `~/.worktrees/myapp/feature-x/` may not realize they need to `npm install` separately.

- **Relative path assumptions**: Many tools (`.editorconfig`, `.prettierrc`, Makefiles, Docker contexts) use relative paths. Moving the worktree away from the repo's typical location can break:
  - Docker builds that mount parent directories
  - Monorepo tools that expect sibling packages at specific relative paths
  - Git hooks that reference `../../.git/hooks/`
  - CI scripts that assume `$PWD` is under the original clone path

### 3.2 Comparison to Competitors (CRITICAL)

Every major competitor has chosen a DIFFERENT approach:

| Tool | Worktree Location | Rationale |
|---|---|---|
| **LazyWorktree** | `~/.local/share/worktrees/<org>-<repo>/` | XDG-compliant, centralized |
| **gwq** | `~/worktrees/<host>/<owner>/<repo>/` | ghq-style, discoverable |
| **worktree-cli** | `../<repo>.worktrees/<branch>/` | Adjacent to repo, IDE-friendly |
| **wtp** | `../worktrees/<branch>/` | Adjacent, configurable |
| **Worktrunk** | Adjacent (template-based paths) | Computed, near the repo |
| **fish-tree** | `~/.worktrees/<project>/<branch>/` | Centralized, hidden |

**The split is roughly 50/50** between centralized and adjacent approaches. Neither is clearly superior, but the adjacent approach has fewer IDE/tooling issues.

**Mitigations:**
- Make the worktree location **configurable** with sensible defaults
- Offer both `adjacent` mode (default: `../<project>.worktrees/<branch>/`) and `centralized` mode (`~/.worktrees/...`)
- Document known IDE issues and provide workarounds
- Auto-run dependency installation (configurable) when creating worktrees

### 3.3 Disk Space and Performance (MEDIUM)

- Each worktree shares the git object store but has its own working tree files
- For a monorepo with 10 worktrees, you're looking at 10x the working tree disk usage
- `node_modules` across worktrees can easily consume 50+ GB
- Git operations on worktrees at `~/.worktrees/` perform identically (they reference the original `.git`), but file watchers (IDE, build tools) add up

**Mitigation:** Show disk usage per worktree. Warn before creating worktrees for large repos. Consider hardlink support for `node_modules` (like pnpm).

---

## 4. TUI vs CLI: Wrong Default?

**Severity: MEDIUM**

### 4.1 The TUI Overhead Problem

A TUI is the right choice for **browsing and exploring** worktrees. But for common operations, a CLI is faster:

| Operation | TUI Time | CLI Time |
|---|---|---|
| Create worktree for branch `foo` | Open TUI -> navigate -> type name -> confirm | `ft create foo` |
| Switch to existing worktree | Open TUI -> find in list -> select | `ft switch foo` or `cd $(ft path foo)` |
| Delete a worktree | Open TUI -> find -> delete -> confirm | `ft rm foo` |
| List worktrees | Open TUI -> read list | `ft ls` |

**The risk:** If the TUI is the *only* interface, power users and scripters will be frustrated. Every competitor offers both CLI and TUI modes.

**Real-world precedent:**
- `lazygit` succeeds because `git` CLI exists separately — lazygit is a TUI *on top of* CLI git
- `lazyworktree` has both TUI and CLI modes
- `gwq` is primarily CLI with fuzzy-finder TUI for selection

### 4.2 Scriptability Concerns

Worktree management is often automated:
- CI/CD pipelines creating worktrees for parallel builds
- AI agent orchestrators (Worktrunk's entire value proposition)
- Custom scripts that manage worktree lifecycle

A TUI-only tool is useless in these contexts.

**Mitigations:**
- **CLI-first, TUI-second**: Build the core as a CLI tool. The TUI is a wrapper around the CLI, not the other way around.
- Ensure every TUI action has a CLI equivalent: `ft create`, `ft switch`, `ft rm`, `ft ls`, `ft status`
- Support `--json` output for scriptability
- The TUI should be invoked explicitly (`ft` or `ft tui`) while direct commands work without it

---

## 5. Fish Shell Exclusivity

**Severity: HIGH**

### 5.1 Market Size Limitation

Exact shell market share is hard to pin down, but available data suggests:
- **Bash**: ~60-70% (default on most Linux distros, older macOS)
- **Zsh**: ~25-30% (default on macOS since Catalina, oh-my-zsh ecosystem)
- **Fish**: ~5-10% (passionate but small community)

By targeting fish shell only, fish-tree immediately excludes **~90% of potential users**.

### 5.2 The Shell Wrapper is Minimal

The only fish-specific piece is the `cd` wrapper — the TUI outputs a path to stdout, and the shell function calls `cd` on it. This is ~5 lines of shell code. Supporting bash and zsh is trivial:

```bash
# Bash/Zsh version
ft() {
  local dir=$(command ft "$@")
  if [ -n "$dir" ] && [ -d "$dir" ]; then
    cd "$dir"
  fi
}
```

```fish
# Fish version
function ft
  set dir (command ft $argv)
  if test -n "$dir" -a -d "$dir"
    cd $dir
  end
end
```

**The effort to support all three shells is approximately 1 hour of work.**

### 5.3 Name Branding Risk

The name "fish-tree" implies fish shell dependency, which:
- Discourages non-fish users from even trying it
- Limits discoverability (people searching for "git worktree tool" won't find "fish-tree")
- Creates confusion about whether it's a fish shell plugin or a general tool

**Mitigations:**
- Support bash, zsh, and fish from day one
- Consider renaming: `wt`, `worktui`, `treeline`, or keep `ft` as the command but don't tie branding to fish
- Ship shell completions for all three shells
- The fish wrapper is a feature, not the product

---

## 6. Scope Creep Traps

**Severity: MEDIUM-HIGH**

### 6.1 Features That Sound Good But Are Traps

| Feature | Why It's Tempting | Why It's a Trap |
|---|---|---|
| **PR integration** | Create worktrees from PRs | Requires GitHub/GitLab/Bitbucket API integration, auth management, token storage. worktree-cli and lazyworktree already do this better. |
| **Multi-repo support** | Manage worktrees across repos | Exponential complexity. Different repos have different states, remotes, auth. |
| **Built-in merge/rebase** | Resolve conflicts in TUI | This is lazygit's domain. Years of work to get right. |
| **CI/CD status** | Show pipeline status per worktree | API integration, polling, auth — massive scope increase for marginal value. |
| **Auto-stash** | Stash changes before switching | Stash is git's worst UX. Auto-stash creates invisible state. Worktrees exist to *avoid* stashing. |
| **Built-in editor** | Edit files in the TUI | OpenTUI has known editor performance issues (#564). This is tmux/editor territory. |
| **Dependency auto-install** | Run `npm install` in new worktrees | Different projects use different package managers. Detection is fragile. |

### 6.2 The Minimum Viable Feature Set

The tool should do exactly 5 things well:
1. **List** worktrees with status (clean/dirty, branch, last commit)
2. **Create** a worktree from a branch (local or remote)
3. **Switch** to a worktree (cd into it)
4. **Delete** a worktree (with safety checks for uncommitted work)
5. **Prune** stale worktrees (merged branches, orphaned directories)

Everything else is v2+.

**Mitigation:** Define the v1 scope explicitly and document what is OUT of scope. Resist feature requests until the core is solid.

---

## 7. Competitive Landscape: Why Would Someone Choose fish-tree?

**Severity: CRITICAL**

### 7.1 The Crowded Field

| Tool | Language | Stars | TUI? | Key Strength |
|---|---|---|---|---|
| **Worktrunk** | Rust | 1,800 | No (CLI) | AI agent workflows, squash-merge automation |
| **gwq** | Go | 331 | Fuzzy finder | ghq-style discovery, multi-repo |
| **LazyWorktree** | Go | 107 | Full TUI | Most feature-complete TUI, PR integration |
| **worktree-cli** | TypeScript | 120 | Interactive select | Cursor/VS Code integration, atomic operations |
| **wtp** | Go | ~50 | No | Simplicity, config-based paths |
| **branchlet** | ? | ~30 | TUI | Terminal automation |
| **fish-tree** | TypeScript/Bun | 0 | Full TUI | ??? |

### 7.2 Differentiation Gap

fish-tree currently has no clear differentiator over LazyWorktree (which has a more mature TUI) or Worktrunk (which has momentum and Rust performance). The honest answer to "why fish-tree?" needs to be compelling:

**Potential differentiators:**
- **Beautiful, opinionated TUI** — if the UX is significantly better than LazyWorktree
- **Zero-config simplicity** — works perfectly out of the box, no setup
- **Shell-native experience** — the `cd` integration and shell completions are first-class
- **Speed** — faster than Go/Rust TUIs? (unlikely given Bun overhead, but possible for specific workflows)

**What won't differentiate:**
- Feature count (LazyWorktree has more)
- Performance (Rust/Go will always win for binary size and startup)
- Ecosystem (Worktrunk has AI agent integration and 1.8k stars)

### 7.3 The "Why Not Just Use..." Test

Every potential user will ask:
- "Why not just use `git worktree` directly?" — Need a compelling UX answer
- "Why not LazyWorktree?" — Need better TUI or simpler setup
- "Why not Worktrunk?" — Need something it doesn't offer (TUI? simplicity?)
- "Why not a VS Code extension?" — Need terminal-native value

**Mitigation:** Define the target user precisely. fish-tree's ideal user is likely: a terminal-native developer who uses fish/zsh, wants a beautiful TUI for *occasional* worktree management, and values simplicity over features. This is a real but narrow audience.

---

## 8. Edge Cases and Technical Risks

**Severity: MEDIUM-HIGH**

### 8.1 Submodules (HIGH)

Git's own documentation says worktree + submodule support is "incomplete and experimental":
- Each worktree gets a **separate copy** of all submodules (no hardlinks), consuming massive disk space
- Submodule initialization is NOT automatic — `git worktree add` leaves submodule directories empty
- `git worktree move` fails on worktrees with submodules
- Removing worktrees with dirty submodules requires `--force`
- Each submodule can be on a different branch in different worktrees

**Mitigation:** Detect submodules and warn users. Offer optional auto-init (`git submodule update --init --recursive`). Document limitations clearly. Don't try to "fix" git's submodule issues.

### 8.2 Large Monorepos (MEDIUM)

Monorepos with 100k+ files create worktrees slowly and consume significant disk space. Each worktree is a full copy of the working tree.

**Mitigation:** Show progress during worktree creation. Display estimated disk usage. Support sparse checkout integration for monorepos.

### 8.3 Uncommitted Changes During Delete (HIGH)

Users will inevitably try to delete worktrees with uncommitted work. Git prevents this by default, but `--force` discards silently.

**Mitigation:** Always check for uncommitted changes before delete. Show a diff summary. Require explicit confirmation. Never auto-force.

### 8.4 Bare Repos vs Regular Clones (MEDIUM)

The worktree workflow differs significantly between bare and regular clones:
- Bare repos: Default fetch refspec doesn't track remote branches (requires manual `git config remote.origin.fetch`)
- Regular clones: Main branch is "occupied" by the clone itself
- Some tools (worktree-cli) explicitly support bare repos; others assume regular clones

**Mitigation:** Support both workflows. Auto-detect bare vs regular. For bare repos, fix the fetch refspec automatically.

### 8.5 Windows Support (LOW for v1, HIGH long-term)

Fish shell barely exists on Windows. But if you ever support bash/zsh, Windows (via WSL or Git Bash) becomes relevant. OpenTUI has known Windows issues (#514).

**Mitigation:** Don't promise Windows support. Test on macOS and Linux only for v1. Document WSL as the Windows path.

---

## Risk Summary Matrix

| # | Risk | Severity | Likelihood | Impact | Mitigation Effort |
|---|---|---|---|---|---|
| 1 | OpenTUI pre-1.0 instability | HIGH | HIGH | HIGH | Medium (abstraction layer) |
| 2 | Bun binary size (57 MB) | MEDIUM | CERTAIN | MEDIUM | Low (accept tradeoff) |
| 3 | No clear differentiator vs competitors | CRITICAL | HIGH | CRITICAL | High (requires UX innovation) |
| 4 | Fish-only excludes 90% of users | HIGH | CERTAIN | HIGH | Low (1 hour to add bash/zsh) |
| 5 | Centralized worktree dir breaks IDEs | HIGH | MEDIUM | HIGH | Low (make configurable) |
| 6 | TUI-only blocks scripting/automation | MEDIUM | HIGH | MEDIUM | Medium (CLI-first design) |
| 7 | Submodule edge cases | MEDIUM-HIGH | MEDIUM | HIGH | Low (detect + warn) |
| 8 | Scope creep (PR integration, etc.) | MEDIUM-HIGH | HIGH | MEDIUM | Low (discipline) |
| 9 | Tmux compatibility (OpenTUI #490) | HIGH | MEDIUM | HIGH | Medium (test + fix) |
| 10 | node_modules per worktree disk usage | MEDIUM | HIGH | MEDIUM | Low (warn + document) |
| 11 | Name "fish-tree" limits audience | MEDIUM | CERTAIN | MEDIUM | Low (rename consideration) |
| 12 | OpenTUI project stalls/dies | MEDIUM | LOW-MEDIUM | CRITICAL | High (abstraction layer) |
| 13 | Bare repo refspec misconfiguration | MEDIUM | MEDIUM | MEDIUM | Low (auto-detect + fix) |
| 14 | Uncommitted work loss on delete | HIGH | HIGH | HIGH | Low (safety checks) |

---

## Top 5 Recommendations

### 1. Support All Major Shells from Day One
The effort is trivial (~1 hour). The cost of being fish-only is enormous (90% audience loss). Ship bash, zsh, and fish wrappers in v1. Consider a name that doesn't imply fish exclusivity.

### 2. Build CLI-First, TUI-Second
Design the core as a CLI tool with clean, scriptable commands. The TUI is a beautiful wrapper around the CLI. This ensures scriptability, testability, and provides fallback if OpenTUI has issues.

### 3. Make Worktree Location Configurable
Default to **adjacent** (`../<project>.worktrees/<branch>/`) for IDE compatibility. Offer centralized (`~/.worktrees/`) as an option. Don't force a single approach.

### 4. Abstract the OpenTUI Dependency
Create an interface between business logic and UI rendering. If OpenTUI breaks, stalls, or makes breaking changes, you can swap to Ink or raw ANSI without rewriting business logic. This is the single most important architectural decision.

### 5. Find Your Differentiator or Don't Build
The market has LazyWorktree (full TUI), Worktrunk (AI workflows), gwq (discovery), and worktree-cli (editor integration). fish-tree needs a clear answer to "why this one?" Possible angles:
- **Best-in-class TUI design** (if OpenTUI delivers on its promise)
- **Opinionated simplicity** (5 commands, zero config, just works)
- **Shell-native integration** (completions, prompts, cd-awareness for all shells)
- **The "lazygit of worktrees"** (if lazygit is to git what fish-tree is to git-worktree)

Without a compelling differentiator, this project will struggle to gain adoption regardless of technical quality.

---

## Conclusion

fish-tree is a viable project with a real use case, but it faces a **crowded competitive landscape** and makes several assumptions that increase risk unnecessarily (fish-only, TUI-only, centralized directory, OpenTUI dependency). The good news: most of these risks have **low-cost mitigations**. The critical question remains: what makes fish-tree worth choosing over the 7+ existing alternatives?
