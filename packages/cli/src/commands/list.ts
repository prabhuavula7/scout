import { Command } from "commander";
import { LocalFileStore } from "@scout/store";

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List every platform you've run Scout against, most recently updated first")
    .action(async () => {
      const runs = await LocalFileStore.list();
      if (runs.length === 0) {
        console.log("No runs yet. Try: scout understand <spec-url>");
        return;
      }
      for (const run of runs) {
        console.log(`${run.slug.padEnd(24)} ${run.status.padEnd(14)} ${run.name}`);
      }
    });
}
