import { z } from "zod";
import { Resource } from "@scout/types";
import { withRetry } from "../base.js";
import type { SearchProvider } from "./provider.js";

const TavilyResult = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      content: z.string(),
    }),
  ),
});

export class TavilyProvider implements SearchProvider {
  readonly name = "tavily";

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<Resource[]> {
    const response = await withRetry(() =>
      fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
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
}
