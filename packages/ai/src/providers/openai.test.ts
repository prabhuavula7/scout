import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolLoopMessage } from "../provider.js";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: createMock } },
  })),
}));

beforeEach(() => {
  createMock.mockClear();
});

describe("OpenAIProvider.completeWithTools", () => {
  it("maps a function tool_call response into ToolCallRequest[], parsing the JSON arguments", async () => {
    const { OpenAIProvider } = await import("./openai.js");
    createMock.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ id: "call_1", type: "function", function: { name: "search_docs", arguments: '{"query":"auth"}' } }],
          },
        },
      ],
    });

    const provider = new OpenAIProvider({ apiKey: "sk-test" });
    const result = await provider.completeWithTools({
      system: "s",
      messages: [{ role: "user", content: "How do I authenticate?" }],
      tools: [],
    });

    expect(result.text).toBeNull();
    expect(result.toolCalls).toEqual([{ id: "call_1", name: "search_docs", input: { query: "auth" } }]);
  });

  it("returns the final text and no tool calls when the model answers directly", async () => {
    const { OpenAIProvider } = await import("./openai.js");
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "Use a Bearer token.", tool_calls: undefined } }] });

    const provider = new OpenAIProvider({ apiKey: "sk-test" });
    const result = await provider.completeWithTools({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [] });

    expect(result.text).toBe("Use a Bearer token.");
    expect(result.toolCalls).toEqual([]);
  });

  it("maps a real multi-turn history (assistant tool call + tool result) to the OpenAI chat-messages shape", async () => {
    const { OpenAIProvider } = await import("./openai.js");
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: "done", tool_calls: undefined } }] });

    const provider = new OpenAIProvider({ apiKey: "sk-test" });
    const messages: ToolLoopMessage[] = [
      { role: "user", content: "How do I authenticate?" },
      { role: "assistant", content: null, toolCalls: [{ id: "call_1", name: "search_docs", input: { query: "auth" } }] },
      { role: "tool_result", toolCallId: "call_1", toolName: "search_docs", content: "Use a Bearer token." },
    ];

    await provider.completeWithTools({ system: "system prompt", messages, tools: [] });

    const requestArg = createMock.mock.calls[0]![0];
    expect(requestArg.tool_choice).toBe("auto");
    expect(requestArg.messages).toEqual([
      { role: "system", content: "system prompt" },
      { role: "user", content: "How do I authenticate?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "search_docs", arguments: '{"query":"auth"}' } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "Use a Bearer token." },
    ]);
  });

  it("throws a clear error if the provider returns no completion choices at all", async () => {
    const { OpenAIProvider } = await import("./openai.js");
    createMock.mockResolvedValueOnce({ choices: [] });

    const provider = new OpenAIProvider({ apiKey: "sk-test" });
    await expect(provider.completeWithTools({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [] })).rejects.toThrow(
      "OpenAI returned no completion choices",
    );
  });
});
