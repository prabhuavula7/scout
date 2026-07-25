import { afterEach, describe, expect, it, vi } from "vitest";
import type { LLMProvider } from "@scout/ai";
import { runRefresh, type RefreshableStore } from "./refresh.js";

function fakeLLM(): LLMProvider {
  return {
    name: "fake",
    complete: vi.fn(),
    completeStructured: vi.fn(async () => ({
      summary: "s",
      architectureOverview: "a",
      authenticationFlow: "auth",
      dataModel: [],
      entityRelationships: [],
      mermaidErDiagram: "erDiagram",
      commonWorkflows: [],
      mermaidSequenceDiagram: "sequenceDiagram",
      integrationOpportunities: [],
      potentialPitfalls: [],
      missingDocumentation: [],
      securityObservations: [],
    })),
    streamComplete: vi.fn(),
    completeWithTools: vi.fn(),
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
  };
}

function fakeStore(overrides: Partial<RefreshableStore> = {}): RefreshableStore {
  const statuses: string[] = [];
  return {
    startAgentRun: vi.fn(async () => ({ id: "run-1" })),
    completeAgentRun: vi.fn(async () => undefined),
    failAgentRun: vi.fn(async () => undefined),
    setPlatformStatus: vi.fn(async (_id: string, status) => {
      statuses.push(status);
    }),
    applyImportResult: vi.fn(async () => undefined),
    insertEndpoints: vi.fn(async () => undefined),
    insertDocChunks: vi.fn(async () => 0),
    getRecentDocChunks: vi.fn(async () => []),
    hybridSearch: vi.fn(async () => []),
    upsertUnderstanding: vi.fn(async () => undefined),
    setDocsCrawlWarning: vi.fn(async () => undefined),
    setUnderstandingScopeWarning: vi.fn(async () => undefined),
    getPlatform: vi.fn(async () => ({ name: "Test Platform" })),
    getEndpoints: vi.fn(async () => []),
    resetDocChunks: vi.fn(async () => undefined),
    ...overrides,
  } as RefreshableStore;
}

describe("runRefresh", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resynthesize mode skips the crawl and just regenerates understanding from stored data", async () => {
    const store = fakeStore();
    const llm = fakeLLM();

    const platformId = "11111111-1111-4111-8111-111111111111";
    await runRefresh(store, platformId, llm, ["https://docs.example.com"], "resynthesize", {
      maxDepth: 2,
      maxPages: 50,
    });

    expect(store.resetDocChunks).not.toHaveBeenCalled();
    expect(llm.completeStructured).toHaveBeenCalledTimes(1);
    expect(store.upsertUnderstanding).toHaveBeenCalledTimes(1);
    expect(store.setPlatformStatus).toHaveBeenCalledWith(platformId, "embedding");
    expect(store.setPlatformStatus).toHaveBeenCalledWith(platformId, "ready");
  });

  it("recrawl mode resets chunks and re-crawls before regenerating understanding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        `<html><head><title>Docs</title></head><body><main><p>${"x".repeat(600)}</p></main></body></html>`,
    });
    vi.stubGlobal("fetch", fetchMock);

    const store = fakeStore();
    const llm = fakeLLM();

    const platformId = "11111111-1111-4111-8111-111111111111";
    await runRefresh(store, platformId, llm, ["https://docs.example.com"], "recrawl", {
      maxDepth: 0,
      maxPages: 10,
    });

    expect(store.resetDocChunks).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("https://docs.example.com/", expect.anything());
    expect(store.setPlatformStatus).toHaveBeenCalledWith(platformId, "crawling_docs");
    expect(store.upsertUnderstanding).toHaveBeenCalledTimes(1);
  });

  it("marks the platform failed and rethrows if understanding synthesis fails", async () => {
    const store = fakeStore();
    const llm = fakeLLM();
    vi.mocked(llm.completeStructured).mockRejectedValueOnce(new Error("LLM exploded"));
    const platformId = "11111111-1111-4111-8111-111111111111";

    await expect(
      runRefresh(store, platformId, llm, [], "resynthesize", { maxDepth: 2, maxPages: 50 }),
    ).rejects.toThrow("LLM exploded");

    expect(store.setPlatformStatus).toHaveBeenCalledWith(platformId, "failed");
  });
});
