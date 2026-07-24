import type { SearchProviderEntry } from "@scout/types";
import type { SearchProvider } from "./provider.js";
import { FallbackSearchProvider } from "./fallback.js";
import { TavilyProvider } from "./tavily.js";
import { SerpApiProvider } from "./serpapi.js";

export function buildSearchProviderFromEntry(entry: SearchProviderEntry): SearchProvider {
  switch (entry.kind) {
    case "tavily":
      return new TavilyProvider(entry.apiKey);
    case "serpapi":
      return new SerpApiProvider(entry.apiKey);
    default: {
      const exhaustive: never = entry.kind;
      throw new Error(`Unknown search provider kind "${exhaustive}"`);
    }
  }
}

/**
 * Builds one SearchProvider that tries enabled entries in priority order,
 * falling back on failure, e.g. Tavily first with SerpApi as a backup.
 * Returns undefined when nothing is configured, so research stays an
 * optional enrichment step rather than a hard requirement.
 */
export function buildSearchProvider(entries: SearchProviderEntry[]): SearchProvider | undefined {
  const ordered = entries.filter((e) => e.enabled).sort((a, b) => a.priority - b.priority);
  if (ordered.length === 0) return undefined;
  const providers = ordered.map(buildSearchProviderFromEntry);
  return providers.length === 1 ? providers[0] : new FallbackSearchProvider(providers);
}
