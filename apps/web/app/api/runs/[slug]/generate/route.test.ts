import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore } from "@scout/store";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-generate-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function postRequest(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/runs/[slug]/generate", () => {
  it("404s for a run that doesn't exist", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts" }), { params: Promise.resolve({ slug: "nope" }) });
    expect(response.status).toBe(404);
  });

  it("400s for an invalid lang", async () => {
    await LocalFileStore.create("Bad Lang Platform", "custom");
    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "rust" }), { params: Promise.resolve({ slug: "bad-lang-platform" }) });
    expect(response.status).toBe(400);
  });

  it("400s when there's no understanding yet", async () => {
    await LocalFileStore.create("No Understanding Platform", "custom");
    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts" }), {
      params: Promise.resolve({ slug: "no-understanding-platform" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/no understanding/i);
  });

  it("generates real code for a run with a supported auth scheme and a read endpoint", async () => {
    const { store, platformId } = await LocalFileStore.create("Real Platform", "custom");
    await store.applyImportResult(platformId, {
      name: "Real Platform",
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

    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ lang: "ts" }), { params: Promise.resolve({ slug: store.slug }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.isStub).toBe(false);
    expect(body.code).toContain("REAL_PLATFORM_API_KEY");
  });

  it("returns valid workflow names in the 400 body when --workflow doesn't match", async () => {
    const { store, platformId } = await LocalFileStore.create("Workflow Platform", "custom");
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
});
