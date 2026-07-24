import { z } from "zod";

export const LLMProviderKind = z.enum([
  "openai",
  "anthropic",
  "azure-openai",
  "openrouter",
  "openai-compatible",
]);
export type LLMProviderKind = z.infer<typeof LLMProviderKind>;

export const LLMRole = z.enum(["chat", "embedding"]);
export type LLMRole = z.infer<typeof LLMRole>;

/**
 * One configured LLM connection. `roles` controls what it's used for: an
 * Anthropic entry might only ever carry "chat" (Anthropic has no embeddings
 * API), paired with a separate OpenAI entry carrying "embedding", so chat
 * and embedding traffic can go to entirely different providers. Multiple
 * entries can share a role; `priority` (lower first) orders the fallback
 * chain within that role.
 */
export const LLMProviderEntry = z.object({
  id: z.string(),
  kind: LLMProviderKind,
  label: z.string().optional(),
  apiKey: z.string(),
  /** Base URL override: required for openai-compatible, the Azure resource
   * endpoint for azure-openai, optional override for openrouter. */
  baseUrl: z.string().optional(),
  /** For azure-openai, this is the chat *deployment name*, not a model id. */
  chatModel: z.string().optional(),
  /** For azure-openai, this is the embedding *deployment name*. */
  embeddingModel: z.string().optional(),
  azureApiVersion: z.string().optional(),
  roles: z.array(LLMRole).min(1),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});
export type LLMProviderEntry = z.infer<typeof LLMProviderEntry>;

export const SearchProviderKind = z.enum(["tavily", "serpapi"]);
export type SearchProviderKind = z.infer<typeof SearchProviderKind>;

export const SearchProviderEntry = z.object({
  id: z.string(),
  kind: SearchProviderKind,
  label: z.string().optional(),
  apiKey: z.string(),
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
});
export type SearchProviderEntry = z.infer<typeof SearchProviderEntry>;

export const ScoutConfig = z.object({
  llmProviders: z.array(LLMProviderEntry).default([]),
  searchProviders: z.array(SearchProviderEntry).default([]),
});
export type ScoutConfig = z.infer<typeof ScoutConfig>;

/** What a client should ever see back for a saved entry: never the raw key. */
export type MaskedLLMProviderEntry = Omit<LLMProviderEntry, "apiKey"> & { apiKeySet: boolean };
export type MaskedSearchProviderEntry = Omit<SearchProviderEntry, "apiKey"> & { apiKeySet: boolean };
export interface MaskedScoutConfig {
  llmProviders: MaskedLLMProviderEntry[];
  searchProviders: MaskedSearchProviderEntry[];
}

export function maskLLMProviderEntry(entry: LLMProviderEntry): MaskedLLMProviderEntry {
  const { apiKey, ...rest } = entry;
  return { ...rest, apiKeySet: apiKey.length > 0 };
}

export function maskSearchProviderEntry(entry: SearchProviderEntry): MaskedSearchProviderEntry {
  const { apiKey, ...rest } = entry;
  return { ...rest, apiKeySet: apiKey.length > 0 };
}

export function maskScoutConfig(config: ScoutConfig): MaskedScoutConfig {
  return {
    llmProviders: config.llmProviders.map(maskLLMProviderEntry),
    searchProviders: config.searchProviders.map(maskSearchProviderEntry),
  };
}
