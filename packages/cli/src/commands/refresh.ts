import { Command } from "commander";
import ora from "ora";
import { runRefresh, type RefreshMode } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider } from "../config.js";

export function registerRefreshCommand(program: Command): void {
  program
    .command("refresh")
    .description("Regenerate a run's understanding, picking up raised limits or new documentation")
    .argument("<slug>", "the run slug, see `scout list`")
    .option(
      "--recrawl",
      "also re-fetch the doc URLs first (needed if --docs-depth/--docs-max-pages changed; otherwise this just re-synthesizes from what's already stored)",
      false,
    )
    .option("--docs-depth <n>", "override this run's crawl depth (only used with --recrawl)")
    .option("--docs-max-pages <n>", "override this run's crawl page cap (only used with --recrawl)")
    .action(
      async (slug: string, options: { recrawl: boolean; docsDepth?: string; docsMaxPages?: string }) => {
        const opened = await LocalFileStore.open(slug);
        if (!opened) {
          console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
          process.exitCode = 1;
          return;
        }
        const { store, platformId } = opened;
        const platform = await store.getPlatform();
        const docUrls = platform.docUrls ?? [];
        const mode: RefreshMode = options.recrawl ? "recrawl" : "resynthesize";

        const crawlOptions = {
          maxDepth: options.docsDepth !== undefined ? Number(options.docsDepth) : (platform.crawlOptions?.maxDepth ?? 2),
          maxPages: options.docsMaxPages !== undefined ? Number(options.docsMaxPages) : (platform.crawlOptions?.maxPages ?? 50),
        };
        if (options.recrawl) await store.setCrawlOptions(crawlOptions.maxDepth, crawlOptions.maxPages);

        const llm = await resolveLLMProvider();
        const spinner = ora(
          mode === "recrawl" ? `Re-crawling docs and refreshing understanding for "${slug}"...` : `Refreshing understanding for "${slug}"...`,
        ).start();
        try {
          await runRefresh(store, platformId, llm, docUrls, mode, crawlOptions);
          spinner.succeed(`Done. Run \`scout serve\` or \`scout chat ${slug}\` to see the update.`);
          const updated = await store.getPlatform();
          if (updated.docsCrawlWarning) console.log(`\nWarning: ${updated.docsCrawlWarning}`);
          if (updated.understandingScopeWarning) console.log(`\nWarning: ${updated.understandingScopeWarning}`);
        } catch (error) {
          spinner.fail(`Failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exitCode = 1;
        }
      },
    );
}
