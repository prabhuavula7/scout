import type { Citation } from "@scout/types";
import type { HybridSearchResult } from "@scout/store";

/**
 * Builds a numbered context block for the LLM prompt and the matching
 * citation objects to attach to the response, so the chat agent can never
 * cite a source it wasn't actually given.
 */
export function buildContextAndCitations(results: HybridSearchResult[]): {
  contextBlock: string;
  citations: Citation[];
} {
  const contextBlock = results
    .map(
      (r, i) =>
        `[${i + 1}] Source: ${r.metadata.sourceTitle} (${r.metadata.sourceUrl})\n${r.content}`,
    )
    .join("\n\n---\n\n");

  const citations: Citation[] = results.map((r) => ({
    chunkId: r.id,
    sourceUrl: r.metadata.sourceUrl,
    sourceTitle: r.metadata.sourceTitle,
    quote: r.content.slice(0, 240),
  }));

  return { contextBlock, citations };
}
