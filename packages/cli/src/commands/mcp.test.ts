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
  resolveLLMProvider: vi.fn(async () => ({ name: "fake" })),
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
        "diff_platform",
        "export_platform",
        "generate_platform",
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
});
