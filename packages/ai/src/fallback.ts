import type { z } from "zod";
import type {
  CompletionParams,
  LLMProvider,
  StructuredCompletionParams,
  ToolCompletionParams,
  ToolCompletionResult,
} from "./provider.js";

/**
 * Tries an ordered list of providers per call, falling back to the next one
 * on failure instead of surfacing the first error. Callers configure the
 * order ("try Anthropic, then OpenAI") via priority in their config entries;
 * this class just executes that chain and reports every attempt's failure
 * if all of them fail.
 */
export class FallbackLLMProvider implements LLMProvider {
  readonly name: string;

  constructor(private readonly providers: LLMProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackLLMProvider requires at least one underlying provider.");
    }
    this.name = providers.map((p) => p.name).join(" -> ");
  }

  private async attempt<T>(fn: (provider: LLMProvider) => Promise<T>): Promise<T> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      try {
        return await fn(provider);
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    throw new Error(`All providers failed:\n${errors.join("\n")}`);
  }

  complete(params: CompletionParams): Promise<string> {
    return this.attempt((provider) => provider.complete(params));
  }

  completeStructured<T extends z.ZodType>(params: StructuredCompletionParams<T>): Promise<z.infer<T>> {
    return this.attempt((provider) => provider.completeStructured(params));
  }

  async *streamComplete(params: CompletionParams): AsyncIterable<string> {
    const errors: string[] = [];
    for (const provider of this.providers) {
      let yieldedAny = false;
      try {
        for await (const chunk of provider.streamComplete(params)) {
          yieldedAny = true;
          yield chunk;
        }
        return;
      } catch (error) {
        errors.push(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
        // A stream that fails after already yielding chunks to the caller
        // can't cleanly "restart" on the next provider without duplicating
        // or garbling output already sent, so only fall back on failures
        // that happen before the first chunk is produced.
        if (yieldedAny) throw new Error(`${provider.name} failed mid-stream: ${errors.at(-1)}`);
      }
    }
    throw new Error(`All providers failed:\n${errors.join("\n")}`);
  }

  embed(texts: string[]): Promise<number[][]> {
    return this.attempt((provider) => provider.embed(texts));
  }

  completeWithTools(params: ToolCompletionParams): Promise<ToolCompletionResult> {
    return this.attempt((provider) => provider.completeWithTools(params));
  }
}
