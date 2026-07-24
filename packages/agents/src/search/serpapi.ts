import { z } from "zod";
import { Resource } from "@scout/types";
import { withRetry } from "../base.js";
import type { SearchProvider } from "./provider.js";

const SerpApiResult = z.object({
  organic_results: z
    .array(
      z.object({
        title: z.string(),
        link: z.string().url(),
        snippet: z.string().optional(),
      }),
    )
    .default([]),
});

export class SerpApiProvider implements SearchProvider {
  readonly name = "serpapi";

  constructor(private readonly apiKey: string) {}

  async search(query: string, maxResults: number): Promise<Resource[]> {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("num", String(maxResults));
    url.searchParams.set("api_key", this.apiKey);

    const response = await withRetry(() => fetch(url));

    if (!response.ok) {
      throw new Error(`SerpApi search failed: HTTP ${response.status}`);
    }

    const parsed = SerpApiResult.parse(await response.json());
    return parsed.organic_results
      .slice(0, maxResults)
      .map((r) => Resource.parse({ title: r.title, url: r.link, snippet: (r.snippet ?? "").slice(0, 280) }));
  }
}
