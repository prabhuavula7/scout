import type { LLMProvider } from "@scout/ai";
import { buildLLMProvider } from "@scout/ai";
import type { SearchProvider } from "@scout/agents";
import { buildSearchProvider } from "@scout/agents";
import { loadScoutConfig } from "@scout/store";

/**
 * Builds the configured LLM provider (chat + embedding fallback chains) for
 * CLI commands, from `~/.scout/config.json` (or OPENAI_API_KEY /
 * TAVILY_API_KEY env vars if nothing has been configured yet). See
 * `@scout/store`'s `loadScoutConfig` for the legacy-config migration and
 * env-fallback behavior this builds on.
 */
export async function resolveLLMProvider(): Promise<LLMProvider> {
  const config = await loadScoutConfig();
  return buildLLMProvider(config.llmProviders);
}

/** Same as `resolveLLMProvider`, for web search (Tavily/SerpApi/etc). */
export async function resolveSearchProvider(): Promise<SearchProvider | undefined> {
  const config = await loadScoutConfig();
  return buildSearchProvider(config.searchProviders);
}
