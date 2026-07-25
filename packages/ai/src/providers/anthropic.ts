import Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type {
  CompletionParams,
  LLMProvider,
  StructuredCompletionParams,
  ToolCompletionParams,
  ToolCompletionResult,
  ToolLoopMessage,
} from "../provider.js";

function toAnthropicMessages(messages: ToolLoopMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const content: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input as Record<string, unknown> });
      }
      out.push({ role: "assistant", content });
      continue;
    }
    // Anthropic requires tool_result blocks inside a user-role message, and
    // this loop always feeds one tool_result per call made in direct
    // response to the assistant's tool_use turn -- merge consecutive
    // tool_results into a single user message rather than one per message.
    const block: Anthropic.ToolResultBlockParam = { type: "tool_result", tool_use_id: m.toolCallId, content: m.content };
    const last = out.at(-1);
    if (last?.role === "user" && Array.isArray(last.content) && last.content.every((c) => c.type === "tool_result")) {
      (last.content as Anthropic.ToolResultBlockParam[]).push(block);
    } else {
      out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

export interface AnthropicProviderOptions {
  apiKey?: string | undefined;
  chatModel?: string | undefined;
}

/**
 * Anthropic has no embeddings endpoint, so this provider only ever serves
 * the "chat" role; pair it with an OpenAI/Azure/compatible entry for
 * "embedding" in the config. completeStructured has no native JSON-schema
 * response mode (unlike OpenAI), so it's implemented via forced tool use:
 * one tool matching the requested schema, tool_choice pinned to it, and the
 * tool call's input is the structured result.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;
  private chatModel: string;

  constructor(options: AnthropicProviderOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Anthropic provider configured without an API key.");
    }
    this.client = new Anthropic({ apiKey });
    this.chatModel = options.chatModel ?? process.env.ANTHROPIC_CHAT_MODEL ?? "claude-sonnet-4-5";
  }

  async complete({ system, prompt, temperature }: CompletionParams): Promise<string> {
    const response = await this.client.messages.create({
      model: this.chatModel,
      max_tokens: 4096,
      system,
      ...(temperature !== undefined && { temperature }),
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) {
      throw new Error("Anthropic returned an empty completion");
    }
    return text;
  }

  async completeStructured<T extends z.ZodType>({
    system,
    prompt,
    schema,
    schemaName,
    temperature,
  }: StructuredCompletionParams<T>): Promise<z.infer<T>> {
    const jsonSchema = zodToJsonSchema(schema, schemaName);
    const response = await this.client.messages.create({
      model: this.chatModel,
      max_tokens: 4096,
      system,
      ...(temperature !== undefined && { temperature }),
      messages: [{ role: "user", content: prompt }],
      tools: [
        {
          name: schemaName,
          description: `Structured output matching the ${schemaName} schema.`,
          input_schema: jsonSchema as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: schemaName },
    });
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`Anthropic failed to return a structured "${schemaName}" response`);
    }
    return schema.parse(toolUse.input);
  }

  async *streamComplete({ system, prompt, temperature }: CompletionParams): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: this.chatModel,
      max_tokens: 4096,
      system,
      ...(temperature !== undefined && { temperature }),
      messages: [{ role: "user", content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield event.delta.text;
      }
    }
  }

  async embed(): Promise<number[][]> {
    throw new Error(
      "Anthropic has no embeddings API. Configure a separate provider (e.g. OpenAI) for the \"embedding\" role.",
    );
  }

  async completeWithTools({ system, messages, tools, temperature }: ToolCompletionParams): Promise<ToolCompletionResult> {
    const response = await this.client.messages.create({
      model: this.chatModel,
      max_tokens: 4096,
      system,
      ...(temperature !== undefined && { temperature }),
      messages: toAnthropicMessages(messages),
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: zodToJsonSchema(t.parameters) as Anthropic.Tool.InputSchema,
      })),
      tool_choice: { type: "auto" },
    });
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const text = textBlocks
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      text: text.length > 0 ? text : null,
      toolCalls: toolUseBlocks.map((b) => ({ id: b.id, name: b.name, input: b.input })),
    };
  }
}
