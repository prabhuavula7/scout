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

export interface OpenAIProviderOptions {
  apiKey?: string | undefined;
  chatModel?: string | undefined;
  embeddingModel?: string | undefined;
}

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;
  private chatModel: string;
  private embeddingModel: string;

  constructor(options: OpenAIProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not set. Add it to your .env file before running AI-powered features.",
      );
    }
    this.client = new OpenAI({ apiKey });
    this.chatModel = options.chatModel ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-5.5";
    this.embeddingModel =
      options.embeddingModel ?? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  }

  // Note: this provider intentionally never sends `temperature` to the API.
  // The default chat model (gpt-5.5) is a reasoning-tier model that only
  // accepts the API default (1) and rejects any explicit override.
  // Callers may still pass CompletionParams.temperature for providers/
  // models that do support it, but the OpenAI adapter ignores it here.
  async complete({ system, prompt }: CompletionParams): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.chatModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty completion");
    }
    return content;
  }

  async completeStructured<T extends z.ZodType>({
    system,
    prompt,
    schema,
    schemaName,
  }: StructuredCompletionParams<T>): Promise<z.infer<T>> {
    const response = await this.client.beta.chat.completions.parse({
      model: this.chatModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });
    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error(`OpenAI failed to return a structured "${schemaName}" response`);
    }
    return parsed;
  }

  async *streamComplete({ system, prompt }: CompletionParams): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.chatModel,
      stream: true,
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
    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
    });
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }

  completeWithTools(params: ToolCompletionParams): Promise<ToolCompletionResult> {
    return completeWithToolsViaOpenAIWire(this.client, this.chatModel, "OpenAI", params);
  }
}
