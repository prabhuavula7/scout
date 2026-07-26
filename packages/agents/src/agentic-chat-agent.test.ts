import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LLMProvider, ToolCallRequest, ToolCompletionParams, ToolCompletionResult } from "@scout/ai";
import { LocalFileStore } from "@scout/store";
import type { Resource } from "@scout/types";
import type { SearchProvider } from "./search/provider.js";
import { runAgenticChatAgent } from "./agentic-chat-agent.js";

/**
 * Plays back a fixed script of completeWithTools responses, one per call,
 * so a test can drive the real multi-turn loop in agentic-chat-agent.ts
 * through a scripted conversation without a live network call to a real
 * LLM API. Everything else in these tests (the store, hybridSearch,
 * generateCode, assembleHandoff) is real, not mocked -- this is the one
 * seam that has to be faked, the same way mcp.test.ts fakes only the
 * agent functions that touch a live LLM/search provider and exercises
 * everything else for real.
 */
class ScriptedToolLLM implements LLMProvider {
  readonly name = "scripted";
  private turnIndex = 0;
  calls: ToolCompletionParams[] = [];

  constructor(private readonly turns: ToolCompletionResult[]) {}

  async complete(): Promise<string> {
    throw new Error("ScriptedToolLLM.complete is not used by the agentic loop");
  }
  async completeStructured(): Promise<never> {
    throw new Error("ScriptedToolLLM.completeStructured is not used by the agentic loop");
  }
  async *streamComplete(): AsyncIterable<string> {
    throw new Error("ScriptedToolLLM.streamComplete is not used by the agentic loop");
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3]);
  }
  async completeWithTools(params: ToolCompletionParams): Promise<ToolCompletionResult> {
    this.calls.push(params);
    const turn = this.turns[this.turnIndex];
    this.turnIndex++;
    if (!turn) throw new Error(`ScriptedToolLLM ran out of scripted turns at call ${this.turnIndex}`);
    return turn;
  }
}

class ThrowingLLM implements LLMProvider {
  readonly name = "throwing";
  async complete(): Promise<string> {
    return "fallback answer from single-shot RAG";
  }
  completeStructured(): Promise<never> {
    throw new Error("not used");
  }
  async *streamComplete(): AsyncIterable<string> {
    throw new Error("not used");
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => [0.1, 0.2, 0.3]);
  }
  async completeWithTools(): Promise<ToolCompletionResult> {
    throw new Error("this provider doesn't support tool-calling");
  }
}

class FakeSearchProvider implements SearchProvider {
  readonly name = "fake-search";
  async search(): Promise<Resource[]> {
    return [{ title: "Idempotency keys explained", url: "https://blog.example.com/idempotency", snippet: "A deep dive on retry-safe APIs." }];
  }
}

function toolCall(name: string, input: unknown, id = "call-1"): ToolCallRequest {
  return { id, name, input };
}

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-agentic-chat-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

async function seedRun() {
  const { store, platformId } = await LocalFileStore.create("Widget API", "custom");
  await store.applyImportResult(platformId, {
    name: "Widget API",
    baseUrl: "https://api.widgets.test",
    authScheme: "bearer_token",
    rawSpec: null,
  });
  await store.insertEndpoints(platformId, [
    {
      group: "widgets",
      method: "GET",
      path: "/widgets",
      summary: "List widgets",
      description: null,
      parameters: [],
      requestBodySchema: null,
      responseSchema: null,
      exampleRequest: null,
      exampleResponse: null,
    },
  ]);
  await store.insertDocChunks(platformId, [
    {
      content: "Idempotency keys prevent duplicate charges when a request is retried after a network failure.",
      metadata: { sourceUrl: "https://docs.widgets.test/idempotency", sourceTitle: "Idempotency", section: null, topic: "best_practices" },
      tokenCount: 15,
      embedding: [0.1, 0.2, 0.3],
    },
  ]);
  await store.upsertUnderstanding(platformId, {
    platformId,
    summary: "s",
    architectureOverview: "a",
    authenticationFlow: "Send a Bearer token.",
    dataModel: [],
    entityRelationships: [],
    commonWorkflows: [{ name: "List widgets", steps: ["Call GET /widgets to list all widgets"] }],
    integrationOpportunities: [],
    potentialPitfalls: [],
    missingDocumentation: [],
    securityObservations: [],
    mermaidSequenceDiagram: "sequenceDiagram",
    mermaidErDiagram: "erDiagram",
    citations: [],
    generatedAt: new Date().toISOString(),
  });
  return { store, platformId };
}

describe("runAgenticChatAgent (real tool dispatch, scripted LLM turns)", () => {
  it("calls search_docs for real, then answers grounded in the real retrieved excerpt", async () => {
    const { store, platformId } = await seedRun();
    const llm = new ScriptedToolLLM([
      { text: null, toolCalls: [toolCall("search_docs", { query: "idempotency" })] },
      { text: "Idempotency keys stop a retried request from double-charging you [1].", toolCalls: [] },
    ]);

    const result = await runAgenticChatAgent(store, llm, undefined, platformId, "How does retry safety work?", []);

    expect(result.answer).toContain("double-charging");
    expect(result.sources).toEqual([
      expect.objectContaining({ type: "docs", ref: "https://docs.widgets.test/idempotency", title: "Idempotency" }),
    ]);
    // The tool result fed back to the model must contain the real chunk content, not a stub.
    const secondCallMessages = llm.calls[1]!.messages;
    const toolResult = secondCallMessages.find((m) => m.role === "tool_result");
    expect(toolResult).toBeDefined();
    expect((toolResult as { content: string }).content).toContain("prevent duplicate charges");
  });

  it("calls generate_starter_code for real and returns the actual syntax-validated script in the tool result", async () => {
    const { store, platformId } = await seedRun();
    const llm = new ScriptedToolLLM([
      { text: null, toolCalls: [toolCall("generate_starter_code", { lang: "ts" })] },
      { text: "Here's a starter script for listing widgets.", toolCalls: [] },
    ]);

    const result = await runAgenticChatAgent(store, llm, undefined, platformId, "Give me starter code", []);

    expect(result.answer).toContain("starter script");
    const secondCallMessages = llm.calls[1]!.messages;
    const toolResult = secondCallMessages.find((m) => m.role === "tool_result");
    const parsed = JSON.parse((toolResult as { content: string }).content);
    expect(parsed.isStub).toBe(false);
    expect(parsed.code).toContain("WIDGET_API_API_KEY");
    expect(parsed.syntaxValidated).toBe(true);
  }, 10000);

  it("calls assemble_handoff for real and returns the actual markdown brief in the tool result", async () => {
    const { store, platformId } = await seedRun();
    const llm = new ScriptedToolLLM([
      { text: null, toolCalls: [toolCall("assemble_handoff", { lang: "ts" })] },
      { text: "I've assembled a handoff brief for your coding agent.", toolCalls: [] },
    ]);

    const result = await runAgenticChatAgent(store, llm, undefined, platformId, "Prep a handoff for Claude Code", []);

    expect(result.answer).toContain("handoff brief");
    const secondCallMessages = llm.calls[1]!.messages;
    const toolResult = secondCallMessages.find((m) => m.role === "tool_result");
    expect((toolResult as { content: string }).content).toContain("# Integration handoff: Widget API");
  }, 10000);

  it("calls web_search for real (via the fake provider) and tags the result as web, not docs", async () => {
    const { store, platformId } = await seedRun();
    const llm = new ScriptedToolLLM([
      { text: null, toolCalls: [toolCall("web_search", { query: "idempotency best practices" })] },
      { text: "Outside these docs, idempotency is a common REST API pattern [1].", toolCalls: [] },
    ]);

    const result = await runAgenticChatAgent(store, llm, new FakeSearchProvider(), platformId, "What's the wider context here?", []);

    expect(result.sources).toEqual([
      expect.objectContaining({ type: "web", ref: "https://blog.example.com/idempotency", title: "Idempotency keys explained" }),
    ]);
  });

  it("does not offer web_search as a tool at all when no search provider is configured", async () => {
    const { store, platformId } = await seedRun();
    const llm = new ScriptedToolLLM([{ text: "No tools needed.", toolCalls: [] }]);

    await runAgenticChatAgent(store, llm, undefined, platformId, "hi", []);

    const toolNames = llm.calls[0]!.tools.map((t) => t.name);
    expect(toolNames).not.toContain("web_search");
  });

  it("tags a direct answer (no tool calls at all) as model_knowledge, never a fabricated docs citation", async () => {
    const { store, platformId } = await seedRun();
    const llm = new ScriptedToolLLM([{ text: "In general, REST APIs commonly use Bearer tokens.", toolCalls: [] }]);

    const result = await runAgenticChatAgent(store, llm, undefined, platformId, "What's a REST API in general?", []);

    expect(result.sources).toEqual([{ type: "model_knowledge", ref: "model" }]);
  });

  it("chains multiple tool calls across turns (search_docs, then generate_starter_code) before answering", async () => {
    const { store, platformId } = await seedRun();
    const llm = new ScriptedToolLLM([
      { text: null, toolCalls: [toolCall("search_docs", { query: "auth" })] },
      { text: null, toolCalls: [toolCall("generate_starter_code", { lang: "ts" }, "call-2")] },
      { text: "Here's how auth works, plus a starter script [1].", toolCalls: [] },
    ]);

    const result = await runAgenticChatAgent(store, llm, undefined, platformId, "How do I authenticate and get started?", []);

    expect(result.answer).toContain("starter script");
    expect(result.sources.some((s) => s.type === "docs")).toBe(true);
    expect(llm.calls).toHaveLength(3);
  }, 10000);

  it("falls back to single-shot grounded RAG when the provider's tool-calling fails outright on the first turn", async () => {
    const { store, platformId } = await seedRun();
    const result = await runAgenticChatAgent(store, new ThrowingLLM(), undefined, platformId, "How does retry safety work?", []);

    expect(result.answer).toBe("fallback answer from single-shot RAG");
    // The fallback path (chat-agent.ts's runChatAgent) grounds via the same real store, so a
    // real citation for the seeded doc chunk should come back, not an empty/fabricated result.
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it("surfaces an honest message instead of an infinite loop when the model never stops calling tools", async () => {
    const { store, platformId } = await seedRun();
    const turns: ToolCompletionResult[] = Array.from({ length: 20 }, (_, i) => ({
      text: null,
      toolCalls: [toolCall("search_docs", { query: "auth" }, `call-${i}`)],
    }));
    const llm = new ScriptedToolLLM(turns);

    const result = await runAgenticChatAgent(store, llm, undefined, platformId, "Keep going forever", []);

    expect(result.answer).toContain("couldn't settle on a final answer");
  });
});
