import { Command } from "commander";
import { runDocumentationAgent, runUnderstandingAgent, MAX_ENDPOINT_SUMMARIES, MAX_DOC_EXCERPTS } from "@scout/agents";
import type { LLMProvider } from "@scout/ai";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider } from "../config.js";
import { hashContent } from "../hash.js";

async function checkForChanges(docUrls: string[], lastHashes: Record<string, string>): Promise<string[]> {
  const changed: string[] = [];
  for (const url of docUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const hash = hashContent(await response.text());
      if (lastHashes[url] !== hash) changed.push(url);
    } catch {
      // A transient fetch failure isn't a documentation change; skip and retry next tick.
    }
  }
  return changed;
}

async function refresh(store: LocalFileStore, platformId: string, docUrls: string[], llm: LLMProvider): Promise<void> {
  await store.resetDocChunks();
  const docResult = await runDocumentationAgent(store, llm, platformId, docUrls);
  await store.setDocsCrawlWarning(
    platformId,
    docResult.thinPages.length > 0
      ? `${docResult.thinPages.length} doc page(s) returned little to no extractable content, possibly JavaScript-rendered pages a static fetch can't execute: ${docResult.thinPages.join(", ")}. Grounded answers about those pages may be limited or missing.`
      : null,
  );

  const endpoints = await store.getEndpoints();
  const platform = await store.getPlatform();
  const endpointSummaries = endpoints.map(
    (e) => `${e.method} ${e.path}: ${e.summary ?? e.description ?? "no description"}`,
  );
  const { chunks: docChunks, totalAvailable: chunksTotal } = store.getRepresentativeDocChunks
    ? await store.getRepresentativeDocChunks(platformId, MAX_DOC_EXCERPTS)
    : { chunks: await store.getRecentDocChunks(platformId, MAX_DOC_EXCERPTS), totalAvailable: MAX_DOC_EXCERPTS };

  await runUnderstandingAgent(store, llm, platformId, {
    platformName: platform.name,
    endpointSummaries,
    docExcerpts: docChunks.map((c) => c.content),
  });

  const endpointsUsed = Math.min(endpointSummaries.length, MAX_ENDPOINT_SUMMARIES);
  const parts: string[] = [];
  if (endpointsUsed < endpointSummaries.length) parts.push(`${endpointsUsed} of ${endpointSummaries.length} endpoints`);
  if (docChunks.length < chunksTotal) parts.push(`${docChunks.length} of ${chunksTotal} doc chunks`);
  await store.setUnderstandingScopeWarning?.(
    platformId,
    parts.length > 0
      ? `This analysis used ${parts.join(" and ")} (kept within a bounded size/cost per run). The blueprint below may not reflect the full platform.`
      : null,
  );
}

export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Poll a run's documentation URLs for changes and refresh the understanding automatically")
    .argument("<slug>", "the run slug, see `scout list`")
    .option("--interval <seconds>", "polling interval in seconds", "3600")
    .action(async (slug: string, options: { interval: string }) => {
      const llm = await resolveLLMProvider();

      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store, platformId } = opened;
      const platform = await store.getPlatform();
      const docUrls = platform.docUrls ?? [];

      if (docUrls.length === 0) {
        console.error(`"${slug}" wasn't imported with any --docs URLs, so there's nothing to watch.`);
        process.exitCode = 1;
        return;
      }

      const intervalMs = Number(options.interval) * 1000;
      console.log(`Watching ${docUrls.length} doc URL(s) for "${platform.name}" every ${options.interval}s. Ctrl+C to stop.`);

      for (;;) {
        const current = await store.getPlatform();
        const changed = await checkForChanges(docUrls, current.lastDocsHash ?? {});

        if (changed.length > 0) {
          console.log(`[${new Date().toISOString()}] Detected changes in: ${changed.join(", ")}. Refreshing...`);
          try {
            await refresh(store, platformId, docUrls, llm);
            for (const url of docUrls) {
              const response = await fetch(url);
              if (response.ok) await store.setDocsHash(url, hashContent(await response.text()));
            }
            console.log(`[${new Date().toISOString()}] Understanding refreshed.`);
          } catch (error) {
            console.error(`[${new Date().toISOString()}] Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    });
}
