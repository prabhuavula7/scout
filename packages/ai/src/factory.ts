import type { LLMProviderEntry } from "@scout/types";
import type { z } from "zod";
import type { CompletionParams, LLMProvider, StructuredCompletionParams } from "./provider.js";
import { FallbackLLMProvider } from "./fallback.js";
import { OpenAIProvider } from "./providers/openai.js";
import { AnthropicProvider } from "./providers/anthropic.js";
import { AzureOpenAIProvider } from "./providers/azure-openai.js";
import { OpenAICompatibleProvider } from "./providers/openai-compatible.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Builds one runtime provider instance from one stored config entry. */
export function buildProviderFromEntry(entry: LLMProviderEntry): LLMProvider {
  switch (entry.kind) {
    case "openai":
      return new OpenAIProvider({
        apiKey: entry.apiKey,
        chatModel: entry.chatModel,
        embeddingModel: entry.embeddingModel,
      });
    case "anthropic":
      return new AnthropicProvider({ apiKey: entry.apiKey, chatModel: entry.chatModel });
    case "azure-openai":
      if (!entry.baseUrl) {
        throw new Error(`Azure OpenAI provider entry "${entry.id}" is missing its endpoint (baseUrl).`);
      }
      return new AzureOpenAIProvider({
        apiKey: entry.apiKey,
        endpoint: entry.baseUrl,
        apiVersion: entry.azureApiVersion,
        chatDeployment: entry.chatModel,
        embeddingDeployment: entry.embeddingModel,
      });
    case "openrouter":
      return new OpenAICompatibleProvider({
        apiKey: entry.apiKey,
        baseUrl: entry.baseUrl ?? OPENROUTER_BASE_URL,
        chatModel: entry.chatModel,
        embeddingModel: entry.embeddingModel,
        displayName: entry.label ?? "OpenRouter",
      });
    case "openai-compatible":
      if (!entry.baseUrl) {
        throw new Error(`OpenAI-compatible provider entry "${entry.id}" is missing its base URL.`);
      }
      return new OpenAICompatibleProvider({
        apiKey: entry.apiKey,
        baseUrl: entry.baseUrl,
        chatModel: entry.chatModel,
        embeddingModel: entry.embeddingModel,
        displayName: entry.label ?? entry.baseUrl,
      });
    default: {
      const exhaustive: never = entry.kind;
      throw new Error(`Unknown LLM provider kind "${exhaustive}"`);
    }
  }
}

function chainForRole(entries: LLMProviderEntry[], role: "chat" | "embedding"): LLMProvider | undefined {
  const ordered = entries
    .filter((e) => e.enabled && e.roles.includes(role))
    .sort((a, b) => a.priority - b.priority);
  if (ordered.length === 0) return undefined;
  const providers = ordered.map(buildProviderFromEntry);
  return providers.length === 1 ? providers[0] : new FallbackLLMProvider(providers);
}

/**
 * Builds one LLMProvider that routes chat operations (complete,
 * completeStructured, streamComplete) through the "chat"-role fallback
 * chain and embed() through the "embedding"-role chain, so a single object
 * can still be handed to agents unchanged even when chat and embeddings are
 * served by entirely different backends (e.g. Anthropic for chat, OpenAI
 * for embeddings, since Anthropic has none of its own).
 */
export function buildLLMProvider(entries: LLMProviderEntry[]): LLMProvider {
  const chat = chainForRole(entries, "chat");
  const embedding = chainForRole(entries, "embedding");

  const setupHint =
    "Get started with one: `scout config llm add openai --api-key sk-...` (or `anthropic`, `azure-openai`, `openrouter`, `openai-compatible` for local models). Or run `scout serve` and add one from the Settings tab.";
  const noChatConfigured = `No LLM provider configured for the "chat" role. ${setupHint}`;
  const noEmbeddingConfigured = `No LLM provider configured for the "embedding" role. ${setupHint}`;

  return {
    name: [chat?.name, embedding?.name].filter(Boolean).join(" | ") || "unconfigured",
    // Every method here is deliberately `async` (or an async generator), even
    // the "not configured" guard clauses: a plain function that throws
    // synchronously breaks any caller using .catch()/.rejects on what the
    // LLMProvider interface promises is always a rejected promise, not a
    // synchronous exception.
    async complete(params: CompletionParams): Promise<string> {
      if (!chat) throw new Error(noChatConfigured);
      return chat.complete(params);
    },
    async completeStructured<T extends z.ZodType>(params: StructuredCompletionParams<T>): Promise<z.infer<T>> {
      if (!chat) throw new Error(noChatConfigured);
      return chat.completeStructured(params);
    },
    async *streamComplete(params: CompletionParams): AsyncIterable<string> {
      if (!chat) throw new Error(noChatConfigured);
      yield* chat.streamComplete(params);
    },
    async embed(texts: string[]): Promise<number[][]> {
      if (!embedding) throw new Error(noEmbeddingConfigured);
      return embedding.embed(texts);
    },
  };
}
