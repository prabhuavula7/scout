import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

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
    .description("Start the local Scout viewer (127.0.0.1 only by default, no login) to browse your runs")
    .option("--port <port>", "port to listen on", "4207")
    .option(
      "--host <host>",
      "address to bind. Defaults to 127.0.0.1 (not reachable from outside the machine); " +
        "use 0.0.0.0 to bind all interfaces, e.g. running inside Docker",
      process.env.SCOUT_SERVE_HOST ?? "127.0.0.1",
    )
    .action(async (options: { port: string; host: string }) => {
      const viewerDir = resolveViewerDir();
      const nextBin = resolveNextBin();

      if (!existsSync(path.join(viewerDir, ".next")) || !existsSync(nextBin)) {
        console.error(
          `Couldn't find the bundled viewer (expected ${viewerDir}/.next and ${nextBin}). ` +
            "This build of @dotapk7/scoutcli may be broken; try reinstalling, or if you're developing " +
            "from source, run `pnpm build` from the repo root first.",
        );
        process.exitCode = 1;
        return;
      }

      const child = spawn(nextBin, ["start", "-H", options.host, "-p", options.port], {
        cwd: viewerDir,
        stdio: "inherit",
        env: { ...process.env },
      });

      // 0.0.0.0 means "all interfaces", not a browsable address; point the
      // user at localhost instead of printing something they can't open.
      const displayHost = options.host === "0.0.0.0" ? "localhost" : options.host;
      console.log(`Scout viewer starting at http://${displayHost}:${options.port}`);

      await new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
      });
    });
}
