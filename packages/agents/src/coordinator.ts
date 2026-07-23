import type { AgentStore } from "@scout/store";
import { getLLMProvider } from "@scout/ai";
import type { ImportRequest, PlatformStatus } from "@scout/types";
import { runAgent } from "./base.js";
import { runImportAgent } from "./import-agent.js";
import { runDocumentationAgent } from "./documentation-agent.js";
import { runUnderstandingAgent } from "./understanding-agent.js";

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
): Promise<void> {
  const llm = getLLMProvider();
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
      await runAgent(store, platformId, "documentation", { docUrls }, () =>
        runDocumentationAgent(store, llm, platformId, docUrls),
      );
    }

    await setStatus("embedding");
    const endpointSummaries = imported.endpoints.map(
      (e) => `${e.method} ${e.path}: ${e.summary ?? e.description ?? "no description"}`,
    );
    const docChunks = await store.getRecentDocChunks(platformId, 40);

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

    await setStatus("ready");
  } catch (error) {
    await setStatus("failed");
    throw error;
  }
}
