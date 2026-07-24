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
        "export_platform",
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
    const understandPayload = JSON.parse((understandResult.content as Array<{ text: string }>)[0].text);
    expect(understandPayload.status).toBe("ready");
    const slug = understandPayload.slug as string;
    expect(slug).toBeTruthy();

    const listResult = await client.callTool({ name: "list_platforms", arguments: {} });
    const runs = JSON.parse((listResult.content as Array<{ text: string }>)[0].text);
    expect(runs).toEqual([{ slug, name: "Widget API", status: "ready" }]);

    const refreshResult = await client.callTool({ name: "refresh_platform", arguments: { slug } });
    expect(refreshResult.isError).toBeFalsy();
    const refreshPayload = JSON.parse((refreshResult.content as Array<{ text: string }>)[0].text);
    expect(refreshPayload.understanding.summary).toBe("refreshed");

    const exportResult = await client.callTool({ name: "export_platform", arguments: { slug, format: "json" } });
    const exported = JSON.parse((exportResult.content as Array<{ text: string }>)[0].text);
    expect(exported.summary).toBe("refreshed");

    const researchResult = await client.callTool({ name: "research_platform", arguments: { slug } });
    expect(researchResult.isError).toBeTruthy(); // no search provider configured, mirrors the CLI's own behavior

    const removeResult = await client.callTool({ name: "remove_platform", arguments: { slug, confirm: false } });
    expect(removeResult.isError).toBeTruthy();

    const confirmedRemoveResult = await client.callTool({ name: "remove_platform", arguments: { slug, confirm: true } });
    expect(confirmedRemoveResult.isError).toBeFalsy();
    expect(await LocalFileStore.open(slug)).toBeNull();
  });

  it("list_connectors returns the real bundled connector registry", async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: "list_connectors", arguments: {} });
    const connectors = JSON.parse((result.content as Array<{ text: string }>)[0].text);
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
