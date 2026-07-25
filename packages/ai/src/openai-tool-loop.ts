import type OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolCompletionParams, ToolCompletionResult, ToolLoopMessage } from "./provider.js";

function toOpenAIMessages(system: string, messages: ToolLoopMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content,
        ...(m.toolCalls.length > 0 && {
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        }),
      });
    } else {
      out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

/**
 * Shared tool-calling implementation for every provider that speaks the
 * OpenAI chat-completions wire protocol (OpenAI, Azure OpenAI, and any
 * OpenAI-compatible endpoint) -- they all take the same `tools`/`tool_choice`
 * shape, so this is the one implementation all three adapters call into
 * rather than duplicating the message/response mapping three times.
 */
export async function completeWithToolsViaOpenAIWire(
  client: OpenAI,
  model: string,
  displayName: string,
  params: ToolCompletionParams,
): Promise<ToolCompletionResult> {
  const response = await client.chat.completions.create({
    model,
    ...(params.temperature !== undefined && { temperature: params.temperature }),
    messages: toOpenAIMessages(params.system, params.messages),
    tools: params.tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: zodToJsonSchema(t.parameters) },
    })),
    tool_choice: "auto",
  });
  const message = response.choices[0]?.message;
  if (!message) {
    throw new Error(`${displayName} returned no completion choices`);
  }
  const toolCalls = (message.tool_calls ?? [])
    .filter((tc): tc is OpenAI.Chat.ChatCompletionMessageToolCall & { type: "function" } => tc.type === "function")
    .map((tc) => ({ id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments) as unknown }));
  return { text: message.content ?? null, toolCalls };
}
