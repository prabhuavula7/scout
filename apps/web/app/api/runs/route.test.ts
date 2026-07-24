import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-config", () => ({
  resolveLLMProvider: vi.fn(async () => ({ name: "fake" })),
}));
vi.mock("@scout/agents", () => ({
  runCoordinator: vi.fn(async () => undefined),
}));

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-runs-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("GET /api/runs", () => {
  it("returns an empty list when no runs exist", async () => {
    const { GET } = await import("./route.js");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe("POST /api/runs", () => {
  it("creates a run and returns 202 with its slug, without waiting for the pipeline", async () => {
    const { POST } = await import("./route.js");
    const { runCoordinator } = await import("@scout/agents");

    const response = await POST(
      new Request("http://localhost/api/runs", {
        method: "POST",
        body: JSON.stringify({
          source: "https://api.example.com/openapi.json",
          kind: "openapi_url",
          docUrls: [],
          label: "Test Platform",
          docsDepth: 1,
          docsMaxPages: 20,
        }),
      }),
    );

    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.slug).toBe("test-platform");

    // Fire-and-poll: the response returns before the pipeline resolves, but
    // it should still have been kicked off.
    await vi.waitFor(() => expect(runCoordinator).toHaveBeenCalled());
  });

  it("rejects an unknown connector slug", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      new Request("http://localhost/api/runs", {
        method: "POST",
        body: JSON.stringify({
          source: "https://api.example.com/openapi.json",
          kind: "openapi_url",
          docUrls: [],
          connectorSlug: "not-a-real-connector",
          docsDepth: 1,
          docsMaxPages: 20,
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
