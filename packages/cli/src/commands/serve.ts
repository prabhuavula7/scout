import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { applyConfigToEnv } from "../config.js";

// packages/cli/dist/index.js -> dist/viewer (apps/web's built .next output,
// see tsup.config.ts's onSuccess) and ../node_modules/.bin/next (next is a
// real dependency of this package, resolved normally by npm/pnpm, not a
// workspace symlink), so `next start` works the same whether this is a
// monorepo checkout or a real npm global install.
function resolveViewerDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url)); // packages/cli/dist
  return path.join(here, "viewer");
}

function resolveNextBin(): string {
  const here = path.dirname(fileURLToPath(import.meta.url)); // packages/cli/dist
  return path.join(here, "..", "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
}

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start the local Scout viewer (127.0.0.1 only, no login) to browse your runs")
    .option("--port <port>", "port to listen on", "4207")
    .action(async (options: { port: string }) => {
      await applyConfigToEnv();

      const viewerDir = resolveViewerDir();
      const nextBin = resolveNextBin();

      if (!existsSync(path.join(viewerDir, ".next")) || !existsSync(nextBin)) {
        console.error(
          `Couldn't find the bundled viewer (expected ${viewerDir}/.next and ${nextBin}). ` +
            "This build of scoutcli may be broken; try reinstalling, or if you're developing " +
            "from source, run `pnpm build` from the repo root first.",
        );
        process.exitCode = 1;
        return;
      }

      const child = spawn(nextBin, ["start", "-H", "127.0.0.1", "-p", options.port], {
        cwd: viewerDir,
        stdio: "inherit",
        env: { ...process.env },
      });

      console.log(`Scout viewer starting at http://127.0.0.1:${options.port}`);

      await new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
      });
    });
}
