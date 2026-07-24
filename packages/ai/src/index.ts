export * from "./provider.js";
export * from "./providers/openai.js";
export * from "./providers/anthropic.js";
export * from "./providers/azure-openai.js";
export * from "./providers/openai-compatible.js";
export * from "./fallback.js";
export * from "./factory.js";

import type { LLMProvider } from "./provider.js";
import { OpenAIProvider } from "./providers/openai.js";

let defaultProvider: LLMProvider | undefined;

/**
 * @deprecated Legacy env-var-only singleton, kept for the dormant hosted
 * mode (apps/api / apps/workers), which still configures itself purely via
 * process.env rather than the multi-provider config file. Everything else
 * (the CLI, the local web viewer) should use `buildLLMProvider` with
 * entries loaded from `@scout/store`'s `loadScoutConfig`, which supports
 * more than just OpenAI and more than one key.
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
