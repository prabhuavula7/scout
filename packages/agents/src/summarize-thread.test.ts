import { describe, expect, it } from "vitest";
import type { CompletionParams, LLMProvider, ToolCompletionParams, ToolCompletionResult } from "@scout/ai";
import { summarizeThreadForHandoff } from "./summarize-thread.js";

class FakeLLM implements LLMProvider {
  readonly name = "fake";
  lastParams: CompletionParams | undefined;

  constructor(private readonly response: string) {}

  async complete(params: CompletionParams): Promise<string> {
    this.lastParams = params;
    return this.response;
  }
  completeStructured(): Promise<never> {
    throw new Error("not used");
  }
  async *streamComplete(): AsyncIterable<string> {
    throw new Error("not used");
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1]);
  }
  async completeWithTools(_params: ToolCompletionParams): Promise<ToolCompletionResult> {
    throw new Error("not used");
  }
}

describe("summarizeThreadForHandoff", () => {
  it("returns an empty string without calling the LLM for an empty thread", async () => {
    const llm = new FakeLLM("should not be returned");
    const result = await summarizeThreadForHandoff(llm, []);
    expect(result).toBe("");
    expect(llm.lastParams).toBeUndefined();
  });

  it("passes the transcript to the LLM and returns its distilled summary", async () => {
    const llm = new FakeLLM("- Pagination uses a cursor param, not page.");
    const result = await summarizeThreadForHandoff(llm, [
      { role: "user", content: "How does pagination work?" },
      { role: "assistant", content: "It uses a cursor query param." },
    ]);

    expect(result).toBe("- Pagination uses a cursor param, not page.");
    expect(llm.lastParams?.prompt).toContain("Developer: How does pagination work?");
    expect(llm.lastParams?.prompt).toContain("Assistant: It uses a cursor query param.");
  });

  it("strips em dashes from the summary", async () => {
    const llm = new FakeLLM("Confirmed the header — X-API-Key — is required.");
    const result = await summarizeThreadForHandoff(llm, [{ role: "user", content: "hi" }]);
    expect(result).not.toContain("—");
  });
});
