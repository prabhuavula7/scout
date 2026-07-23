import { z } from "zod";
import { Resource } from "@scout/types";
import { withRetry } from "./base.js";

const TavilyResult = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      content: z.string(),
    }),
  ),
});

/**
 * Research Agent: finds real-world articles, tutorials, and use-case
 * write-ups for a platform via the Tavily search API, since an LLM's own
 * knowledge of "what people actually built with this API" is stale and
 * unverifiable. Returns an empty list (not an error) if no API key is
 * configured, so this stays an optional enrichment step, not a blocker.
 */
export async function runResearchAgent(
  apiKey: string | undefined,
  platformName: string,
  maxResults = 6,
): Promise<Resource[]> {
  if (!apiKey) return [];

  const response = await withRetry(() =>
    fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${platformName} API integration tutorial use cases`,
        max_results: maxResults,
        search_depth: "basic",
      }),
    }),
  );

  if (!response.ok) {
    throw new Error(`Tavily search failed: HTTP ${response.status}`);
  }

  const parsed = TavilyResult.parse(await response.json());
  return parsed.results.map((r) => Resource.parse({ title: r.title, url: r.url, snippet: r.content.slice(0, 280) }));
}
