import { Command } from "commander";
import ora from "ora";
import { runResearchAgent } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { loadConfig } from "../config.js";

export function registerResearchCommand(program: Command): void {
  program
    .command("research")
    .description("Find related articles, tutorials, and real-world use cases for a run (needs a Tavily API key)")
    .argument("<slug>", "the run slug, see `scout list`")
    .action(async (slug: string) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store } = opened;

      const config = await loadConfig();
      const tavilyApiKey = process.env.TAVILY_API_KEY ?? config.tavilyApiKey;
      if (!tavilyApiKey) {
        console.error(
          "No Tavily API key configured. Get one at tavily.com, then run: scout config set tavily-api-key <key>",
        );
        process.exitCode = 1;
        return;
      }

      const platform = await store.getPlatform();
      const spinner = ora(`Searching for resources on ${platform.name}...`).start();
      try {
        const resources = await runResearchAgent(tavilyApiKey, platform.name);
        await store.saveResources(resources);
        spinner.succeed(`Found ${resources.length} resource(s).`);
        for (const resource of resources) {
          console.log(`- ${resource.title}\n  ${resource.url}`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
}
