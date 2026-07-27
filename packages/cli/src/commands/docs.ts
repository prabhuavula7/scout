import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { runUploadFileAgent, runUploadLinkAgent } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider } from "../config.js";

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function registerDocsCommand(program: Command): void {
  const docs = program
    .command("docs")
    .description("Attach extra documents (files or links) to a run's grounded doc corpus, beyond its crawled --docs URLs");

  docs
    .command("add")
    .description("Attach a local file or a link to a run; retrieved and cited exactly like a crawled doc page")
    .argument("<slug>", "the run slug, see `scout list`")
    .argument("<file-or-url>", "a local file path, or an http(s) URL")
    .action(async (slug: string, fileOrUrl: string) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store, platformId } = opened;
      const llm = await resolveLLMProvider();

      try {
        const result = looksLikeUrl(fileOrUrl)
          ? await runUploadLinkAgent(store, llm, platformId, { url: fileOrUrl })
          : await runUploadFileAgent(store, llm, platformId, {
              filename: path.basename(fileOrUrl),
              buffer: await fs.readFile(fileOrUrl),
            });

        console.log(`Attached "${result.sourceTitle}": ${result.chunksStored} chunk(s) stored.`);
        if (result.warning) console.error(`Warning: ${result.warning}`);
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });

  docs
    .command("list")
    .description("List every doc source (crawled, uploaded, or linked) behind a run's grounded chat")
    .argument("<slug>", "the run slug, see `scout list`")
    .action(async (slug: string) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store, platformId } = opened;
      const sources = (await store.listDocSources?.(platformId)) ?? [];
      if (sources.length === 0) {
        console.log("No doc sources yet.");
        return;
      }
      for (const s of sources) {
        console.log(`${(s.origin ?? "crawl").padEnd(8)} ${String(s.chunkCount).padStart(3)} chunk(s)  ${s.sourceTitle}  (${s.sourceUrl})`);
      }
    });

  docs
    .command("rm")
    .description("Remove a doc source (and every chunk it produced) from a run")
    .argument("<slug>", "the run slug, see `scout list`")
    .argument("<source-url>", "the sourceUrl shown by `scout docs list`")
    .action(async (slug: string, sourceUrl: string) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store, platformId } = opened;
      const removed = (await store.deleteDocChunksBySource?.(platformId, sourceUrl)) ?? 0;
      console.log(removed > 0 ? `Removed ${removed} chunk(s) for ${sourceUrl}.` : `No chunks found for ${sourceUrl}.`);
    });
}
