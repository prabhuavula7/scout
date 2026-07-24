import type { Resource } from "@scout/types";
import type { SearchProvider } from "./search/provider.js";

/**
 * Research Agent: finds real-world articles, tutorials, and use-case
 * write-ups for a platform via a configured web search provider, since an
 * LLM's own knowledge of "what people actually built with this API" is
 * stale and unverifiable. Returns an empty list (not an error) when no
 * search provider is configured, so this stays an optional enrichment
 * step, not a blocker.
 */
export async function runResearchAgent(
  searchProvider: SearchProvider | undefined,
  platformName: string,
  maxResults = 6,
): Promise<Resource[]> {
  if (!searchProvider) return [];

  return searchProvider.search(`${platformName} API integration tutorial use cases`, maxResults);
}
