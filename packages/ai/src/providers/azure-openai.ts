import { AzureOpenAI } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type {
  CompletionParams,
  LLMProvider,
  StructuredCompletionParams,
} from "../provider.js";

export interface AzureOpenAIProviderOptions {
  apiKey: string;
  /** Resource endpoint, e.g. https://example-resource.openai.azure.com */
  endpoint: string;
  apiVersion?: string | undefined;
  /** Deployment name for chat, not a model id (Azure names these per-resource). */
  chatDeployment?: string | undefined;
  /** Deployment name for embeddings. */
  embeddingDeployment?: string | undefined;
}

/**
 * Azure OpenAI's REST shape mirrors OpenAI's, but URLs are keyed by
 * deployment name rather than model id, and the SDK's AzureOpenAI client
 * bakes one deployment into its base URL at construction time. Chat and
 * embeddings commonly use different deployments, so this provider builds
 * two lazily-created clients instead of one.
 */
export class AzureOpenAIProvider implements LLMProvider {
  readonly name = "azure-openai";
  private options: AzureOpenAIProviderOptions;
  private chatClient?: AzureOpenAI;
  private embeddingClient?: AzureOpenAI;

  constructor(options: AzureOpenAIProviderOptions) {
    this.options = options;
  }

  private getChatClient(): AzureOpenAI {
    if (!this.options.chatDeployment) {
      throw new Error("Azure OpenAI provider has no chat deployment configured.");
    }
    if (!this.chatClient) {
      this.chatClient = new AzureOpenAI({
        apiKey: this.options.apiKey,
        endpoint: this.options.endpoint,
        apiVersion: this.options.apiVersion ?? "2024-10-21",
        deployment: this.options.chatDeployment,
      });
    }
    return this.chatClient;
  }

  private getEmbeddingClient(): AzureOpenAI {
    if (!this.options.embeddingDeployment) {
      throw new Error("Azure OpenAI provider has no embedding deployment configured.");
    }
    if (!this.embeddingClient) {
      this.embeddingClient = new AzureOpenAI({
        apiKey: this.options.apiKey,
        endpoint: this.options.endpoint,
        apiVersion: this.options.apiVersion ?? "2024-10-21",
        deployment: this.options.embeddingDeployment,
      });
    }
    return this.embeddingClient;
  }

  async complete({ system, prompt, temperature }: CompletionParams): Promise<string> {
    const response = await this.getChatClient().chat.completions.create({
      model: this.options.chatDeployment!,
      ...(temperature !== undefined && { temperature }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Azure OpenAI returned an empty completion");
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
    const response = await this.getChatClient().beta.chat.completions.parse({
      model: this.options.chatDeployment!,
      ...(temperature !== undefined && { temperature }),
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      response_format: zodResponseFormat(schema, schemaName),
    });
    const parsed = response.choices[0]?.message?.parsed;
    if (!parsed) {
      throw new Error(`Azure OpenAI failed to return a structured "${schemaName}" response`);
    }
    return parsed;
  }

  async *streamComplete({ system, prompt, temperature }: CompletionParams): AsyncIterable<string> {
    const stream = await this.getChatClient().chat.completions.create({
      model: this.options.chatDeployment!,
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
    const response = await this.getEmbeddingClient().embeddings.create({
      model: this.options.embeddingDeployment!,
      input: texts,
    });
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}
