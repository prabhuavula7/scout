import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolLoopMessage } from "../provider.js";

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: createMock },
  })),
}));

beforeEach(() => {
  createMock.mockClear();
});

describe("AnthropicProvider.completeWithTools", () => {
  it("maps a tool_use response into ToolCallRequest[], and text blocks into `text`", async () => {
    const { AnthropicProvider } = await import("./anthropic.js");
    createMock.mockResolvedValueOnce({
      content: [
        { type: "text", text: "Let me check the docs." },
        { type: "tool_use", id: "toolu_1", name: "search_docs", input: { query: "auth" } },
      ],
    });

    const provider = new AnthropicProvider({ apiKey: "sk-test" });
    const result = await provider.completeWithTools({
      system: "system prompt",
      messages: [{ role: "user", content: "How do I authenticate?" }],
      tools: [],
    });

    expect(result.text).toBe("Let me check the docs.");
    expect(result.toolCalls).toEqual([{ id: "toolu_1", name: "search_docs", input: { query: "auth" } }]);
  });

  it("returns text: null when the response is only tool_use blocks (the model made no final statement yet)", async () => {
    const { AnthropicProvider } = await import("./anthropic.js");
    createMock.mockResolvedValueOnce({
      content: [{ type: "tool_use", id: "toolu_2", name: "search_docs", input: { query: "rate limits" } }],
    });

    const provider = new AnthropicProvider({ apiKey: "sk-test" });
    const result = await provider.completeWithTools({ system: "s", messages: [{ role: "user", content: "hi" }], tools: [] });

    expect(result.text).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
  });

  it("sends tools with tool_choice auto, and maps a real multi-turn history (assistant tool call + tool result) to Anthropic's message shape", async () => {
    const { AnthropicProvider } = await import("./anthropic.js");
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "done" }] });

    const provider = new AnthropicProvider({ apiKey: "sk-test" });
    const messages: ToolLoopMessage[] = [
      { role: "user", content: "How do I authenticate?" },
      { role: "assistant", content: null, toolCalls: [{ id: "toolu_1", name: "search_docs", input: { query: "auth" } }] },
      { role: "tool_result", toolCallId: "toolu_1", toolName: "search_docs", content: "Use a Bearer token." },
    ];

    await provider.completeWithTools({ system: "s", messages, tools: [] });

    const requestArg = createMock.mock.calls[0]![0];
    expect(requestArg.tool_choice).toEqual({ type: "auto" });
    expect(requestArg.messages).toEqual([
      { role: "user", content: "How do I authenticate?" },
      { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "search_docs", input: { query: "auth" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "Use a Bearer token." }] },
    ]);
  });

  it("merges consecutive tool_result turns into a single user message with multiple tool_result blocks", async () => {
    const { AnthropicProvider } = await import("./anthropic.js");
    createMock.mockResolvedValueOnce({ content: [{ type: "text", text: "done" }] });

    const provider = new AnthropicProvider({ apiKey: "sk-test" });
    const messages: ToolLoopMessage[] = [
      { role: "user", content: "Do two things" },
      {
        role: "assistant",
        content: null,
        toolCalls: [
          { id: "toolu_1", name: "search_docs", input: { query: "a" } },
          { id: "toolu_2", name: "web_search", input: { query: "b" } },
        ],
      },
      { role: "tool_result", toolCallId: "toolu_1", toolName: "search_docs", content: "docs result" },
      { role: "tool_result", toolCallId: "toolu_2", toolName: "web_search", content: "web result" },
    ];

    await provider.completeWithTools({ system: "s", messages, tools: [] });

    const requestArg = createMock.mock.calls[0]![0];
    const lastMessage = requestArg.messages.at(-1);
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_1", content: "docs result" },
      { type: "tool_result", tool_use_id: "toolu_2", content: "web result" },
    ]);
  });
});
