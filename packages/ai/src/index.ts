export * from "./provider.js";
export * from "./providers/openai.js";

import type { LLMProvider } from "./provider.js";
import { OpenAIProvider } from "./providers/openai.js";

let defaultProvider: LLMProvider | undefined;

/**
 * Returns the configured LLM provider (singleton). Reading AI_PROVIDER makes
 * it possible to point the whole app at a different backend without
 * touching agent code.
 */
export function getLLMProvider(): LLMProvider {
  if (!defaultProvider) {
    const providerName = process.env.AI_PROVIDER ?? "openai";
    switch (providerName) {
      case "openai":
        defaultProvider = new OpenAIProvider();
        break;
      default:
        throw new Error(`Unknown AI_PROVIDER "${providerName}". Supported: openai`);
    }
  }
  return defaultProvider;
}
