import type { LLMProvider } from "@scout/ai";
import { buildLLMProvider } from "@scout/ai";
import type { SearchProvider } from "@scout/agents";
import { buildSearchProvider } from "@scout/agents";
import { loadScoutConfig } from "@scout/store";

/** Server-side equivalent of the CLI's resolveLLMProvider: same shared
 * `~/.scout/config.json`, so a key added in the Settings tab works for the
 * CLI and vice versa. */
export async function resolveLLMProvider(): Promise<LLMProvider> {
  const config = await loadScoutConfig();
  return buildLLMProvider(config.llmProviders);
}

export async function resolveSearchProvider(): Promise<SearchProvider | undefined> {
  const config = await loadScoutConfig();
  return buildSearchProvider(config.searchProviders);
}
