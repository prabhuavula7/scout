import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileStore } from "@scout/store";

vi.mock("@/lib/server-config", () => ({
  resolveLLMProvider: vi.fn(async () => ({
    name: "fake",
    complete: vi.fn(async () => "- Confirmed pagination uses a cursor param, not page."),
  })),
  resolveSearchProvider: vi.fn(async () => undefined),
}));

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-handoff-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function postRequest(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/runs/[slug]/handoff", () => {
  it("404s for a run that doesn't exist", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts" }), { params: Promise.resolve({ slug: "nope" }) });
    expect(response.status).toBe(404);
  });

  it("400s for an invalid lang", async () => {
    await LocalFileStore.create("Bad Lang Handoff Platform", "custom");
    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "rust" }), {
      params: Promise.resolve({ slug: "bad-lang-handoff-platform" }),
    });
    expect(response.status).toBe(400);
  });

  it("400s when there's no understanding yet", async () => {
    await LocalFileStore.create("No Understanding Handoff Platform", "custom");
    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts" }), {
      params: Promise.resolve({ slug: "no-understanding-handoff-platform" }),
    });
    expect(response.status).toBe(400);
  });

  it("assembles a real brief for a run with a supported auth scheme and a read endpoint", async () => {
    const { store, platformId } = await LocalFileStore.create("Real Handoff Platform", "custom");
    await store.applyImportResult(platformId, {
      name: "Real Handoff Platform",
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
    await store.upsertUnderstanding(platformId, {
      platformId,
      summary: "s",
      architectureOverview: "a",
      authenticationFlow: "auth",
      dataModel: [],
      entityRelationships: [],
      commonWorkflows: [{ name: "List widgets", steps: ["Call GET /widgets"] }],
      integrationOpportunities: [],
      potentialPitfalls: [],
      missingDocumentation: [],
      securityObservations: [],
      mermaidSequenceDiagram: "sequenceDiagram",
      mermaidErDiagram: "erDiagram",
      citations: [],
      generatedAt: new Date().toISOString(),
    });

    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts" }), { params: Promise.resolve({ slug: store.slug }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workflowUsed).toBe("List widgets");
    expect(body.markdown).toContain("# Integration handoff: Real Handoff Platform");
    expect(body.markdown).toContain("REAL_HANDOFF_PLATFORM_API_KEY");
  });

  it("returns valid workflow names in the 400 body when the workflow doesn't match", async () => {
    const { store, platformId } = await LocalFileStore.create("Workflow Handoff Platform", "custom");
    await store.upsertUnderstanding(platformId, {
      platformId,
      summary: "s",
      architectureOverview: "a",
      authenticationFlow: "auth",
      dataModel: [],
      entityRelationships: [],
      commonWorkflows: [{ name: "Real workflow", steps: ["step"] }],
      integrationOpportunities: [],
      potentialPitfalls: [],
      missingDocumentation: [],
      securityObservations: [],
      mermaidSequenceDiagram: "sequenceDiagram",
      mermaidErDiagram: "erDiagram",
      citations: [],
      generatedAt: new Date().toISOString(),
    });

    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts", workflow: "nope" }), {
      params: Promise.resolve({ slug: store.slug }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.validNames).toEqual(["Real workflow"]);
  });

  it("folds a thread's conversation into the brief as an LLM-summarized section when threadId is given", async () => {
    const { store, platformId } = await LocalFileStore.create("Threaded Handoff Platform", "custom");
    await store.upsertUnderstanding(platformId, {
      platformId,
      summary: "s",
      architectureOverview: "a",
      authenticationFlow: "auth",
      dataModel: [],
      entityRelationships: [],
      commonWorkflows: [],
      integrationOpportunities: [],
      potentialPitfalls: [],
      missingDocumentation: [],
      securityObservations: [],
      mermaidSequenceDiagram: "sequenceDiagram",
      mermaidErDiagram: "erDiagram",
      citations: [],
      generatedAt: new Date().toISOString(),
    });
    const thread = await store.createChatThread("Pagination questions");
    await store.appendChatMessage(thread.id, "user", "How does pagination work?", []);
    await store.appendChatMessage(thread.id, "assistant", "It uses a cursor query param.", []);

    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts", threadId: thread.id }), {
      params: Promise.resolve({ slug: store.slug }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.markdown).toContain("## Already figured out in chat");
    expect(body.markdown).toContain("Confirmed pagination uses a cursor param, not page.");
  });

  it("omits the thread-summary section when the given thread has no messages yet", async () => {
    const { store, platformId } = await LocalFileStore.create("Empty Thread Handoff Platform", "custom");
    await store.upsertUnderstanding(platformId, {
      platformId,
      summary: "s",
      architectureOverview: "a",
      authenticationFlow: "auth",
      dataModel: [],
      entityRelationships: [],
      commonWorkflows: [],
      integrationOpportunities: [],
      potentialPitfalls: [],
      missingDocumentation: [],
      securityObservations: [],
      mermaidSequenceDiagram: "sequenceDiagram",
      mermaidErDiagram: "erDiagram",
      citations: [],
      generatedAt: new Date().toISOString(),
    });
    const thread = await store.createChatThread("Empty thread");

    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts", threadId: thread.id }), {
      params: Promise.resolve({ slug: store.slug }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.markdown).not.toContain("## Already figured out in chat");
  });
});
