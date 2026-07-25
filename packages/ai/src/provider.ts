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

/** A tool the model may choose to call, described by a Zod schema for its arguments. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType;
}

/** One tool invocation the model asked for. `input` is unvalidated -- the caller re-parses it against the tool's own schema before running it. */
export interface ToolCallRequest {
  id: string;
  name: string;
  input: unknown;
}

/**
 * One turn of a tool-calling conversation. Callers (the agentic loop) own
 * the full history and append to it themselves: a "user" turn, an
 * "assistant" turn (text and/or tool calls the model made), and a
 * "tool_result" turn per tool call actually executed, fed back in before
 * asking the model to continue.
 */
export type ToolLoopMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: ToolCallRequest[] }
  | { role: "tool_result"; toolCallId: string; toolName: string; content: string };

export interface ToolCompletionParams {
  system: string;
  messages: ToolLoopMessage[];
  tools: ToolDefinition[];
  temperature?: number;
}

/** `toolCalls` is empty when the model chose to answer instead of calling a tool -- `text` is then guaranteed non-null. */
export interface ToolCompletionResult {
  text: string | null;
  toolCalls: ToolCallRequest[];
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
  /** One turn of real multi-turn tool-calling (native tool-use API on every provider here: Anthropic, and the OpenAI-wire function-calling shape shared by OpenAI/Azure OpenAI/OpenAI-compatible). */
  completeWithTools(params: ToolCompletionParams): Promise<ToolCompletionResult>;
}
