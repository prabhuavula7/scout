import type { Resource } from "@scout/types";

/**
 * Provider-agnostic web search interface, same shape as `LLMProvider` in
 * @scout/ai: agents depend on this, not on any one search API directly.
 */
export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number): Promise<Resource[]>;
}
