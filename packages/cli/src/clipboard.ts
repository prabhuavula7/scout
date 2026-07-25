import { spawn } from "node:child_process";

function run(cmd: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"] });
    } catch (error) {
      reject(error);
      return;
    }
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`"${cmd}" exited with code ${code}`))));
    child.stdin.write(input);
    child.stdin.end();
  });
}

/**
 * Copies text to the system clipboard by shelling out to whatever native
 * copy tool the platform actually has, instead of adding a clipboard
 * dependency: `pbcopy` (macOS), `clip` (Windows), `xclip`/`xsel` (Linux,
 * X11 desktops, wherever DISPLAY is set), `wl-copy` (Linux, Wayland). None
 * of these are guaranteed to exist (a headless server, a Wayland box
 * without wl-clipboard, a container with neither), so a missing tool is a
 * real failure the caller must surface, not silently swallow.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (process.platform === "darwin") {
    return run("pbcopy", [], text);
  }
  if (process.platform === "win32") {
    return run("clip", [], text);
  }
  const linuxTools: Array<[string, string[]]> = [
    ["wl-copy", []],
    ["xclip", ["-selection", "clipboard"]],
    ["xsel", ["--clipboard", "--input"]],
  ];
  let lastError: unknown;
  for (const [cmd, args] of linuxTools) {
    try {
      await run(cmd, args, text);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `No clipboard tool found (tried wl-copy, xclip, xsel). Install one of them, or drop --copy and use --out/stdout instead. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
