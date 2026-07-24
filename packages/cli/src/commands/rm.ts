import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Command } from "commander";
import { LocalFileStore } from "@scout/store";

export function registerRmCommand(program: Command): void {
  program
    .command("rm")
    .description("Delete a run and everything under it (understanding, chat history, doc chunks)")
    .argument("<slug>", "the run slug, see `scout list`")
    .option("-y, --yes", "skip the confirmation prompt")
    .action(async (slug: string, options: { yes?: boolean }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }

      if (!options.yes) {
        const platform = await opened.store.getPlatform();
        const rl = readline.createInterface({ input: stdin, output: stdout });
        const answer = await rl.question(`Delete "${platform.name}" (${slug})? This can't be undone. [y/N] `);
        rl.close();
        if (answer.trim().toLowerCase() !== "y") {
          console.log("Cancelled.");
          return;
        }
      }

      await LocalFileStore.remove(slug);
      console.log(`Removed "${slug}".`);
    });
}
