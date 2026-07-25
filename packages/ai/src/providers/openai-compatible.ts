import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type {
  CompletionParams,
  LLMProvider,
  StructuredCompletionParams,
  ToolCompletionParams,
  ToolCompletionResult,
} from "../provider.js";
import { completeWithToolsViaOpenAIWire } from "../openai-tool-loop.js";

export interface OpenAICompatibleProviderOptions {
  apiKey?: string | undefined;
  baseUrl: string;
  chatModel?: string | undefined;
  embeddingModel?: string | undefined;
  /** Display name for error messages ("OpenRouter", "local model", etc). */
  displayName?: string | undefined;
}

/**
 * Any backend that speaks the OpenAI chat-completions wire protocol at a
 * custom base URL: OpenRouter, Ollama/LM Studio/vLLM running locally, Groq,
 * Together, or any other self-hosted/open-source endpoint. One adapter
 * instead of one per vendor, same tradeoff the connector registry makes for
 * platform docs (config, not code) applied to model backends.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private client: OpenAI;
  private chatModel: string;
  private embeddingModel: string | undefined;
  private displayName: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    // Local model servers (Ollama, LM Studio) typically don't check the key
    // at all; a placeholder keeps the OpenAI SDK's required-field check happy.
    const apiKey = options.apiKey ?? "not-required";
    this.client = new OpenAI({ apiKey, baseURL: options.baseUrl });
    this.chatModel = options.chatModel ?? "gpt-4o-mini";
    this.embeddingModel = options.embeddingModel;
    this.displayName = options.displayName ?? "OpenAI-compatible endpoint";
    this.name = this.displayName.toLowerCase().replace(/\s+/g, "-");
  }

  async complete({ system, prompt, temperature }: CompletionParams): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      ...(temperature !== undefined && { temperature }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`${this.displayName} returned an empty completion`);
    }
    return content;
  }

  async completeStructured<T extends z.ZodType>({
    system,
    prompt,
    schema,
    schemaName,
    temperature,
  }: StructuredCompletionParams<T>): Promise<z.infer<T>> {
    const response = await this.client.beta.chat.completions.parse({
      model: this.chatModel,
      ...(temperature !== undefined && { temperature }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });
    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error(`${this.displayName} failed to return a structured "${schemaName}" response`);
    }
    return parsed;
  }

  async *streamComplete({ system, prompt, temperature }: CompletionParams): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.chatModel,
      stream: true as const,
      ...(temperature !== undefined && { temperature }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!this.embeddingModel) {
      throw new Error(
        `${this.displayName} has no embedding model configured. Set one for this entry, or use a different provider for the "embedding" role.`,
      );
    }
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }

  completeWithTools(params: ToolCompletionParams): Promise<ToolCompletionResult> {
    return completeWithToolsViaOpenAIWire(this.client, this.chatModel, this.displayName, params);
  }
}
