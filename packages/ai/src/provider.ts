import type { z } from "zod";

export interface CompletionParams {
  system: string;
  prompt: string;
  temperature?: number;
}

export interface StructuredCompletionParams<T extends z.ZodType> extends CompletionParams {
  schema: T;
  schemaName: string;
}

/**
 * Provider-agnostic LLM interface. Every agent depends on this, not on the
 * OpenAI SDK directly, so swapping to Claude/Gemini/OpenRouter later is a
 * matter of adding one adapter and flipping an env var.
 */
export interface LLMProvider {
  readonly name: string;
  complete(params: CompletionParams): Promise<string>;
  completeStructured<T extends z.ZodType>(params: StructuredCompletionParams<T>): Promise<z.infer<T>>;
  streamComplete(params: CompletionParams): AsyncIterable<string>;
  embed(texts: string[]): Promise<number[][]>;
}
