import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LocalFileStore } from "@scout/store";

// Real LLM/search calls are out of scope for this test: it verifies the MCP
// protocol plumbing (tool discovery + call routing + response shape) drives
// the same store/agent code the CLI and web app use, not that a live model
// produces good output. runCoordinator/runRefresh/runResearchAgent are the
// only pieces of "understand"/"refresh"/"research" that touch an LLM or web
// search provider, so those three are the only mocks here.
const fakeUnderstanding = {
  platformId: "00000000-0000-0000-0000-000000000000",
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
  citations: [],
  generatedAt: new Date().toISOString(),
};

vi.mock("../config.js", () => ({
  resolveLLMProvider: vi.fn(async () => ({
    name: "fake",
    complete: vi.fn(async () => "- Confirmed pagination uses a cursor param, not page."),
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
  })),
  resolveSearchProvider: vi.fn(async () => undefined),
}));

vi.mock("@scout/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@scout/agents")>();
  return {
    ...actual,
    runCoordinator: vi.fn(async (store: { setPlatformStatus: (id: string, s: string) => Promise<void>; upsertUnderstanding: (id: string, u: unknown) => Promise<void> }, platformId: string) => {
      await store.setPlatformStatus(platformId, "ready");
      await store.upsertUnderstanding(platformId, fakeUnderstanding);
    }),
    runRefresh: vi.fn(async (store: { setPlatformStatus: (id: string, s: string) => Promise<void>; upsertUnderstanding: (id: string, u: unknown) => Promise<void> }, platformId: string) => {
      await store.setPlatformStatus(platformId, "ready");
      await store.upsertUnderstanding(platformId, { ...fakeUnderstanding, summary: "refreshed" });
    }),
    runResearchAgent: vi.fn(async () => [{ title: "An article", url: "https://example.com/a", snippet: "..." }]),
  };
});

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-mcp-test-"));
  process.env.SCOUT_HOME = tmpHome;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function firstText(result: Record<string, unknown>): string {
  const [first] = result.content as Array<{ text: string }>;
  if (!first) throw new Error("Expected at least one content block in the tool result");
  return first.text;
}

async function connectedClient() {
  const { createScoutMcpServer } = await import("./mcp.js");
  const server = createScoutMcpServer();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

describe("scout mcp server (end-to-end over the MCP protocol)", () => {
  it("advertises every tool an agent needs to do what the CLI/web app can do", async () => {
    const client = await connectedClient();
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "ask_platform",
        "attach_document_platform",
        "diff_platform",
        "export_platform",
        "generate_platform",
        "handoff_platform",
        "list_connectors",
        "list_platforms",
        "refresh_platform",
        "remove_platform",
        "research_platform",
        "understand_platform",
      ].sort(),
    );
  });

  it("understand_platform creates a real run an agent can then chat with, refresh, and export", async () => {
    const client = await connectedClient();

    const understandResult = await client.callTool({
      name: "understand_platform",
      arguments: { specUrl: "https://example.com/openapi.json", label: "Widget API" },
    });
    expect(understandResult.isError).toBeFalsy();
    const understandPayload = JSON.parse(firstText(understandResult));
    expect(understandPayload.status).toBe("ready");
    const slug = understandPayload.slug as string;
    expect(slug).toBeTruthy();

    const listResult = await client.callTool({ name: "list_platforms", arguments: {} });
    const runs = JSON.parse(firstText(listResult));
    expect(runs).toEqual([{ slug, name: "Widget API", status: "ready" }]);

    const refreshResult = await client.callTool({ name: "refresh_platform", arguments: { slug } });
    expect(refreshResult.isError).toBeFalsy();
    const refreshPayload = JSON.parse(firstText(refreshResult));
    expect(refreshPayload.understanding.summary).toBe("refreshed");

    const exportResult = await client.callTool({ name: "export_platform", arguments: { slug, format: "json" } });
    const exported = JSON.parse(firstText(exportResult));
    expect(exported.summary).toBe("refreshed");

    const researchResult = await client.callTool({ name: "research_platform", arguments: { slug } });
    expect(researchResult.isError).toBeTruthy(); // no search provider configured, mirrors the CLI's own behavior

    // This run has zero stored endpoints (runCoordinator is mocked above, so it never calls
    // insertEndpoints) -- exercises generate_platform's honest-stub path, not the happy path.
    const generateStubResult = await client.callTool({ name: "generate_platform", arguments: { slug, lang: "ts" } });
    expect(generateStubResult.isError).toBeFalsy();
    const generateStubPayload = JSON.parse(firstText(generateStubResult));
    expect(generateStubPayload.isStub).toBe(true);
    expect(generateStubPayload.stubReason).toBe("no-endpoints-available");

    const removeResult = await client.callTool({ name: "remove_platform", arguments: { slug, confirm: false } });
    expect(removeResult.isError).toBeTruthy();

    const confirmedRemoveResult = await client.callTool({ name: "remove_platform", arguments: { slug, confirm: true } });
    expect(confirmedRemoveResult.isError).toBeFalsy();
    expect(await LocalFileStore.open(slug)).toBeNull();
  });

  it("generate_platform produces a real runnable script when auth + a read endpoint are actually present", async () => {
    const { store, platformId } = await LocalFileStore.create("Real API", "custom");
    await store.applyImportResult(platformId, {
      name: "Real API",
      baseUrl: "https://api.real.test",
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
    await store.upsertUnderstanding(platformId, fakeUnderstanding);

    const client = await connectedClient();
    const result = await client.callTool({ name: "generate_platform", arguments: { slug: store.slug, lang: "py" } });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(firstText(result));
    expect(payload.isStub).toBe(false);
    expect(payload.code).toContain("import requests");
    expect(payload.code).toContain("REAL_API_API_KEY");
  });

  it("handoff_platform assembles a paste-ready brief that embeds the same real script generate_platform produces", async () => {
    const { store, platformId } = await LocalFileStore.create("Real API", "custom");
    await store.applyImportResult(platformId, {
      name: "Real API",
      baseUrl: "https://api.real.test",
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
    await store.upsertUnderstanding(platformId, fakeUnderstanding);

    const client = await connectedClient();
    const result = await client.callTool({ name: "handoff_platform", arguments: { slug: store.slug, lang: "py" } });
    expect(result.isError).toBeFalsy();
    const markdown = firstText(result);
    expect(markdown).toContain("# Integration handoff: Real API");
    expect(markdown).toContain("import requests");
    expect(markdown).toContain("REAL_API_API_KEY");
    expect(markdown).toContain("`GET /widgets` -- List widgets");
  });

  it("handoff_platform folds a named thread's conversation into the brief via ask_platform's own thread history", async () => {
    const { store, platformId } = await LocalFileStore.create("Threaded API", "custom");
    await store.upsertUnderstanding(platformId, fakeUnderstanding);
    const thread = await store.createChatThread("Pagination questions");
    await store.appendChatMessage(thread.id, "user", "How does pagination work?", []);
    await store.appendChatMessage(thread.id, "assistant", "It uses a cursor param.", []);

    const client = await connectedClient();
    const result = await client.callTool({
      name: "handoff_platform",
      arguments: { slug: store.slug, lang: "ts", thread: "Pagination questions" },
    });
    expect(result.isError).toBeFalsy();
    const markdown = firstText(result);
    expect(markdown).toContain("## Already figured out in chat");
    expect(markdown).toContain("Confirmed pagination uses a cursor param, not page.");
  });

  it("handoff_platform reports a clear error for an unknown thread name instead of silently ignoring it", async () => {
    const { store, platformId } = await LocalFileStore.create("Unknown Thread API", "custom");
    await store.upsertUnderstanding(platformId, fakeUnderstanding);

    const client = await connectedClient();
    const result = await client.callTool({
      name: "handoff_platform",
      arguments: { slug: store.slug, lang: "ts", thread: "does-not-exist" },
    });
    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('No thread named "does-not-exist"');
  });

  it("handoff_platform reports an unknown-workflow error the same way generate_platform does", async () => {
    const { store, platformId } = await LocalFileStore.create("Diffable API", "custom");
    await store.upsertUnderstanding(platformId, fakeUnderstanding);

    const client = await connectedClient();
    const result = await client.callTool({
      name: "handoff_platform",
      arguments: { slug: store.slug, lang: "ts", workflow: "does-not-exist" },
    });
    expect(result.isError).toBeTruthy();
    const payload = JSON.parse(firstText(result));
    expect(payload.error).toContain("Unknown workflow");
  });

  it("diff_platform reports no prior snapshot for a fresh run, then real drift after a second understanding is stored", async () => {
    const { store, platformId } = await LocalFileStore.create("Diffable API", "custom");
    await store.upsertUnderstanding(platformId, fakeUnderstanding);

    const client = await connectedClient();
    const firstDiff = await client.callTool({ name: "diff_platform", arguments: { slug: store.slug } });
    expect(JSON.parse(firstText(firstDiff)).hasPriorSnapshot).toBe(false);

    await store.upsertUnderstanding(platformId, {
      ...fakeUnderstanding,
      commonWorkflows: [{ name: "A brand new workflow", steps: ["step"] }],
    });

    const secondDiff = await client.callTool({ name: "diff_platform", arguments: { slug: store.slug } });
    const diffPayload = JSON.parse(firstText(secondDiff));
    expect(diffPayload.hasPriorSnapshot).toBe(true);
    expect(diffPayload.workflowsAdded).toEqual(["A brand new workflow"]);
  });

  it("list_connectors returns the real bundled connector registry", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "list_connectors", arguments: {} });
    const connectors = JSON.parse(firstText(result));
    expect(connectors.some((c: { slug: string }) => c.slug === "contentful")).toBe(true);
  });

  it("ask_platform and export_platform report a clear error for an unknown slug instead of throwing", async () => {
    const client = await connectedClient();
    const askResult = await client.callTool({ name: "ask_platform", arguments: { slug: "nope", question: "hi" } });
    expect(askResult.isError).toBe(true);
    const exportResult = await client.callTool({ name: "export_platform", arguments: { slug: "nope" } });
    expect(exportResult.isError).toBe(true);
  });

  describe("ask_platform (multi-platform)", () => {
    it("rejects a call passing both slug and slugs, or neither", async () => {
      const client = await connectedClient();

      const both = await client.callTool({
        name: "ask_platform",
        arguments: { slug: "a", slugs: ["a", "b"], question: "hi" },
      });
      expect(both.isError).toBe(true);

      const neither = await client.callTool({ name: "ask_platform", arguments: { question: "hi" } });
      expect(neither.isError).toBe(true);
    });

    it("reports a clear error when slugs is given without a title", async () => {
      const { store: a } = await LocalFileStore.create("Multi A", "custom");
      const { store: b } = await LocalFileStore.create("Multi B", "custom");
      const client = await connectedClient();

      const result = await client.callTool({
        name: "ask_platform",
        arguments: { slugs: [a.slug, b.slug], question: "hi" },
      });
      expect(result.isError).toBe(true);
      expect(firstText(result)).toMatch(/needs "title"/i);
    });

    it("reports a clear error for an unknown slug inside slugs", async () => {
      const { store: a } = await LocalFileStore.create("Multi Known", "custom");
      const client = await connectedClient();

      const result = await client.callTool({
        name: "ask_platform",
        arguments: { slugs: [a.slug, "nope"], question: "hi", title: "Cross-platform" },
      });
      expect(result.isError).toBe(true);
      expect(firstText(result)).toContain("nope");
    });

    it("asks across multiple platforms, then reuses the same thread on a later call with the same slugs and title", async () => {
      const { store: a } = await LocalFileStore.create("Multi Reuse A", "custom");
      const { store: b } = await LocalFileStore.create("Multi Reuse B", "custom");
      const client = await connectedClient();

      const first = await client.callTool({
        name: "ask_platform",
        arguments: { slugs: [a.slug, b.slug], question: "How do these relate?", title: "Reuse thread" },
      });
      expect(first.isError).toBeFalsy();
      const firstPayload = JSON.parse(firstText(first));
      expect(firstPayload.threadId).toBeDefined();

      const second = await client.callTool({
        name: "ask_platform",
        arguments: { slugs: [b.slug, a.slug], question: "Follow-up question", title: "Reuse thread" },
      });
      const secondPayload = JSON.parse(firstText(second));
      expect(secondPayload.threadId).toBe(firstPayload.threadId);

      const { MultiRunThreadStore: Store } = await import("@scout/store");
      const history = await Store.getHistory(firstPayload.threadId);
      expect(history.map((m) => m.content)).toEqual([
        "How do these relate?",
        firstPayload.answer,
        "Follow-up question",
        secondPayload.answer,
      ]);
    });
  });

  describe("attach_document_platform", () => {
    it("attaches a local file, storing chunks tagged origin: upload", async () => {
      const { store, platformId } = await LocalFileStore.create("Attachable API", "custom");
      const filePath = path.join(tmpHome, "runbook.md");
      await fs.writeFile(
        filePath,
        `## Internal runbook\n\n${"This service retries failed webhooks up to five times with exponential backoff. ".repeat(4)}`,
      );

      const client = await connectedClient();
      const result = await client.callTool({
        name: "attach_document_platform",
        arguments: { slug: store.slug, filePath },
      });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(firstText(result));
      expect(payload.chunksStored).toBeGreaterThan(0);
      expect(payload.sourceUrl).toBe(`scout-upload://${platformId}/runbook.md`);

      const sources = await store.listDocSources!(platformId);
      expect(sources[0]!.origin).toBe("upload");
    });

    it("attaches a link, storing chunks tagged origin: link", async () => {
      const { store } = await LocalFileStore.create("Linkable API", "custom");
      const html = `<html><head><title>Webhooks guide</title></head><body><main><p>${"Configure a webhook endpoint to receive real-time events. ".repeat(
        6,
      )}</p></main></body></html>`;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          headers: new Headers({ "content-type": "text/html" }),
          arrayBuffer: async () => new TextEncoder().encode(html).buffer,
        }),
      );

      const client = await connectedClient();
      const result = await client.callTool({
        name: "attach_document_platform",
        arguments: { slug: store.slug, url: "https://blog.example.com/webhooks" },
      });
      expect(result.isError).toBeFalsy();
      const payload = JSON.parse(firstText(result));
      expect(payload.sourceTitle).toBe("Webhooks guide");
      vi.unstubAllGlobals();
    });

    it("rejects a call passing both filePath and url, or neither", async () => {
      const { store } = await LocalFileStore.create("Ambiguous API", "custom");
      const client = await connectedClient();

      const both = await client.callTool({
        name: "attach_document_platform",
        arguments: { slug: store.slug, filePath: "/tmp/x.md", url: "https://example.com" },
      });
      expect(both.isError).toBe(true);

      const neither = await client.callTool({ name: "attach_document_platform", arguments: { slug: store.slug } });
      expect(neither.isError).toBe(true);
    });

    it("reports a clear error for an unknown slug instead of throwing", async () => {
      const client = await connectedClient();
      const result = await client.callTool({
        name: "attach_document_platform",
        arguments: { slug: "nope", url: "https://example.com" },
      });
      expect(result.isError).toBe(true);
    });
  });
});
