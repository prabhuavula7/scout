import type { AgentStore } from "@scout/store";
import type { LLMProvider } from "@scout/ai";
import type { ImportRequest, PlatformStatus } from "@scout/types";
import { runAgent } from "./base.js";
import { runImportAgent } from "./import-agent.js";
import { runDocumentationAgent, type CrawlOptions } from "./documentation-agent.js";
import { runUnderstandingAgent, MAX_ENDPOINT_SUMMARIES, MAX_DOC_EXCERPTS } from "./understanding-agent.js";

export function crawlWarning(thinPages: string[], failedPages: Array<{ url: string; error: string }>): string | null {
  const parts: string[] = [];
  if (failedPages.length > 0) {
    parts.push(
      `${failedPages.length} doc page(s) failed to crawl and were skipped: ${failedPages.map((f) => f.url).join(", ")}`,
    );
  }
  if (thinPages.length > 0) {
    parts.push(
      `${thinPages.length} doc page(s) returned little to no extractable content, possibly JavaScript-rendered pages a static fetch can't execute: ${thinPages.join(", ")}`,
    );
  }
  if (parts.length === 0) return null;
  return `${parts.join(". ")}. Grounded answers about those pages may be limited or missing.`;
}

/**
 * Understanding synthesis is bounded (see MAX_ENDPOINT_SUMMARIES /
 * MAX_DOC_EXCERPTS): large platforms silently lose the tail of their
 * endpoint list or doc corpus otherwise. This turns that into a disclosed
 * fact instead of a silent gap, the same honesty principle the tool
 * already applies via "missingDocumentation" for the platform's own docs.
 */
export function scopeWarning(
  endpointsTotal: number,
  endpointsUsed: number,
  chunksTotal: number,
  chunksUsed: number,
): string | null {
  const parts: string[] = [];
  if (endpointsUsed < endpointsTotal) parts.push(`${endpointsUsed} of ${endpointsTotal} endpoints`);
  if (chunksUsed < chunksTotal) parts.push(`${chunksUsed} of ${chunksTotal} doc chunks`);
  if (parts.length === 0) return null;
  return `This analysis used ${parts.join(" and ")} (kept within a bounded size/cost per run). The blueprint below may not reflect the full platform.`;
}

/**
 * Coordinator Agent: runs the full pipeline for a newly imported platform
 * (import spec -> persist endpoints -> crawl docs -> generate understanding),
 * advancing platform status at each stage so callers (the CLI's progress
 * spinner, or the dormant hosted mode's UI) can show real progress instead
 * of a spinner with no meaning.
 */
export async function runCoordinator(
  store: AgentStore,
  platformId: string,
  request: ImportRequest,
  docUrls: string[],
  llm: LLMProvider,
  crawlOptions?: CrawlOptions,
): Promise<void> {
  const setStatus = (status: PlatformStatus) => store.setPlatformStatus(platformId, status);

  try {
    await setStatus("importing");
    const imported = await runAgent(store, platformId, "import", { request }, () =>
      runImportAgent(request),
    );

    await store.applyImportResult(platformId, {
      name: imported.name,
      baseUrl: imported.baseUrl,
      authScheme: imported.authScheme,
      rawSpec: imported.rawSpec,
    });

    if (imported.endpoints.length > 0) {
      await store.insertEndpoints(platformId, imported.endpoints);
    }

    if (docUrls.length > 0) {
      await setStatus("crawling_docs");
      const docResult = await runAgent(store, platformId, "documentation", { docUrls }, () =>
        runDocumentationAgent(store, llm, platformId, docUrls, crawlOptions),
      );
      await store.setDocsCrawlWarning?.(platformId, crawlWarning(docResult.thinPages, docResult.failedPages));
    }

    await setStatus("embedding");
    const endpointSummaries = imported.endpoints.map(
      (e) => `${e.method} ${e.path}: ${e.summary ?? e.description ?? "no description"}`,
    );

    const { chunks: docChunks, totalAvailable: chunksTotal } = store.getRepresentativeDocChunks
      ? await store.getRepresentativeDocChunks(platformId, MAX_DOC_EXCERPTS)
      : { chunks: await store.getRecentDocChunks(platformId, MAX_DOC_EXCERPTS), totalAvailable: MAX_DOC_EXCERPTS };

    await runAgent(
      store,
      platformId,
      "understanding",
      { endpointCount: imported.endpoints.length, docChunkCount: docChunks.length },
      () =>
        runUnderstandingAgent(store, llm, platformId, {
          platformName: imported.name,
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

    await setStatus("ready");
  } catch (error) {
    await setStatus("failed");
    throw error;
  }
}
