import type { LLMProvider } from "@scout/ai";
import type { AgentStore } from "@scout/store";
import type { Endpoint, PlatformStatus } from "@scout/types";
import { runAgent } from "./base.js";
import { runDocumentationAgent, type CrawlOptions } from "./documentation-agent.js";
import { runUnderstandingAgent, MAX_ENDPOINT_SUMMARIES, MAX_DOC_EXCERPTS } from "./understanding-agent.js";
import { crawlWarning, scopeWarning } from "./coordinator.js";

export type RefreshMode = "resynthesize" | "recrawl";

/**
 * Everything `runRefresh` needs beyond the minimal `AgentStore` contract.
 * `LocalFileStore` already satisfies this structurally; the dormant hosted
 * store doesn't need to, since refresh is a CLI/web-serve-only concept.
 */
export interface RefreshableStore extends AgentStore {
  getPlatform(): Promise<{ name: string }>;
  getEndpoints(): Promise<Endpoint[]>;
  resetDocChunks(): Promise<void>;
  setPlatformStatus(platformId: string, status: PlatformStatus): Promise<void>;
}

/**
 * Re-runs the pipeline against an already-imported platform without
 * re-importing the spec itself. Two modes:
 *  - "resynthesize": reuse whatever endpoints/doc chunks are already stored
 *    and just regenerate the understanding. Cheap (one LLM call); this is
 *    all that's needed to pick up a raised MAX_ENDPOINT_SUMMARIES/
 *    MAX_DOC_EXCERPTS, since those only bound prompt selection, not storage.
 *  - "recrawl": also re-fetches docUrls first. Needed when maxDepth/
 *    maxPages themselves changed, since a stored run only has however many
 *    pages it originally crawled.
 */
export async function runRefresh(
  store: RefreshableStore,
  platformId: string,
  llm: LLMProvider,
  docUrls: string[],
  mode: RefreshMode,
  crawlOptions: CrawlOptions,
): Promise<void> {
  try {
    if (mode === "recrawl" && docUrls.length > 0) {
      await store.setPlatformStatus(platformId, "crawling_docs");
      await store.resetDocChunks();
      const docResult = await runAgent(store, platformId, "documentation", { docUrls, refresh: true }, () =>
        runDocumentationAgent(store, llm, platformId, docUrls, crawlOptions),
      );
      await store.setDocsCrawlWarning?.(platformId, crawlWarning(docResult.thinPages, docResult.failedPages));
    }

    await store.setPlatformStatus(platformId, "embedding");
    const endpoints = await store.getEndpoints();
    const platform = await store.getPlatform();
    const endpointSummaries = endpoints.map(
      (e) => `${e.method} ${e.path}: ${e.summary ?? e.description ?? "no description"}`,
    );

    const { chunks: docChunks, totalAvailable: chunksTotal } = store.getRepresentativeDocChunks
      ? await store.getRepresentativeDocChunks(platformId, MAX_DOC_EXCERPTS)
      : { chunks: await store.getRecentDocChunks(platformId, MAX_DOC_EXCERPTS), totalAvailable: MAX_DOC_EXCERPTS };

    await runAgent(
      store,
      platformId,
      "understanding",
      { endpointCount: endpoints.length, docChunkCount: docChunks.length, refresh: true },
      () =>
        runUnderstandingAgent(store, llm, platformId, {
          platformName: platform.name,
          endpointSummaries,
          docExcerpts: docChunks.map((c) => c.content),
        }),
    );

    await store.setUnderstandingScopeWarning?.(
      platformId,
      scopeWarning(
        endpointSummaries.length,
        Math.min(endpointSummaries.length, MAX_ENDPOINT_SUMMARIES),
        chunksTotal,
        docChunks.length,
      ),
    );

    await store.setPlatformStatus(platformId, "ready");
  } catch (error) {
    await store.setPlatformStatus(platformId, "failed");
    throw error;
  }
}
