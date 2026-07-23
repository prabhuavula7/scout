import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { applyConfigToEnv } from "../config.js";

// packages/cli/dist/commands/serve.js (bundled: dist/index.js) -> apps/web,
// two levels up from packages/cli. In a published npx install, apps/web
// isn't part of the package at all yet (tracked as a follow-up: bundling a
// prebuilt viewer into the npm package rather than assuming a monorepo
// checkout); this works today for the local monorepo / `pnpm --filter
// scoutcli dev` path.
function resolveWebAppDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url)); // packages/cli/dist
  return path.resolve(here, "../../../apps/web");
}

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Start the local Scout viewer (127.0.0.1 only, no login) to browse your runs")
    .option("--port <port>", "port to listen on", "4207")
    .action(async (options: { port: string }) => {
      await applyConfigToEnv();

      const webAppDir = resolveWebAppDir();
      const nextBin = path.join(webAppDir, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
      const child = spawn(nextBin, ["start", "-H", "127.0.0.1", "-p", options.port], {
        cwd: webAppDir,
        stdio: "inherit",
        env: { ...process.env },
      });

      console.log(`Scout viewer starting at http://127.0.0.1:${options.port}`);

      await new Promise<void>((resolve) => {
        child.on("exit", () => resolve());
      });
    });
}
