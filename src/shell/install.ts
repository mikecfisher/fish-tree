import { join, dirname } from "path";

const GUARD_BEGIN = "# >>> fish-tree >>>";
const GUARD_END = "# <<< fish-tree <<<";

type Shell = "fish" | "bash" | "zsh";

const WRAPPER_DIR = join(dirname(import.meta.dir), "shell", "wrappers");

function detectShell(): Shell | null {
  const shell = process.env.SHELL ?? "";
  if (shell.endsWith("/fish")) return "fish";
  if (shell.endsWith("/zsh")) return "zsh";
  if (shell.endsWith("/bash")) return "bash";
  return null;
}

function getWrapperSource(shell: Shell): string {
  return join(WRAPPER_DIR, `ft.${shell}`);
}

function getRcPath(shell: Shell): string {
  const home = process.env.HOME!;
  switch (shell) {
    case "fish":
      return join(
        process.env.XDG_CONFIG_HOME ?? join(home, ".config"),
        "fish",
        "functions",
        "ft.fish",
      );
    case "bash":
      return join(home, ".bashrc");
    case "zsh":
      return join(home, ".zshrc");
  }
}

async function installForFish(): Promise<void> {
  const src = getWrapperSource("fish");
  const dest = getRcPath("fish");
  const destDir = dirname(dest);

  await Bun.$`mkdir -p ${destDir}`.quiet();

  const content = await Bun.file(src).text();
  await Bun.write(dest, content);

  console.log(`Installed fish wrapper to ${dest}`);
}

async function installForShell(shell: "bash" | "zsh"): Promise<void> {
  const src = getWrapperSource(shell);
  const rcPath = getRcPath(shell);

  // Check if already installed
  const rcFile = Bun.file(rcPath);
  const existing = (await rcFile.exists()) ? await rcFile.text() : "";

  if (existing.includes(GUARD_BEGIN)) {
    // Replace existing block
    const before = existing.substring(
      0,
      existing.indexOf(GUARD_BEGIN),
    );
    const after = existing.substring(
      existing.indexOf(GUARD_END) + GUARD_END.length + 1,
    );
    const wrapperContent = await Bun.file(src).text();
    await Bun.write(
      rcPath,
      `${before}${GUARD_BEGIN}\n${wrapperContent}${GUARD_END}\n${after}`,
    );
    console.log(`Updated fish-tree wrapper in ${rcPath}`);
    return;
  }

  // Append new block
  const wrapperContent = await Bun.file(src).text();
  const block = `\n${GUARD_BEGIN}\n${wrapperContent}${GUARD_END}\n`;
  await Bun.write(rcPath, existing + block);

  console.log(`Installed fish-tree wrapper in ${rcPath}`);
}

async function installShellWrapper(shell: Shell): Promise<void> {
  if (shell === "fish") {
    await installForFish();
  } else {
    await installForShell(shell);
  }
}

export async function install(args: string[]): Promise<void> {
  const all = args.includes("--all");
  const shells: Shell[] = all
    ? ["fish", "bash", "zsh"]
    : (() => {
        const detected = detectShell();
        if (!detected) {
          console.error(
            "Could not detect shell from $SHELL. Use --all to install for all shells.",
          );
          process.exit(1);
        }
        return [detected];
      })();

  for (const shell of shells) {
    await installShellWrapper(shell);
  }

  console.log(
    `\nRestart your shell or run: source ${getRcPath(shells[0]!)}`,
  );
}
