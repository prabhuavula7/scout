import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileStore } from "@scout/store";

vi.mock("@/lib/server-config", () => ({
  resolveSearchProvider: vi.fn(),
}));
vi.mock("@scout/agents", () => ({
  runResearchAgent: vi.fn(),
}));

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-research-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("POST /api/runs/[slug]/research", () => {
  it("404s for a run that doesn't exist", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "nope" }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 400 with a clear message when no search provider is configured", async () => {
    await LocalFileStore.create("No Search Platform", "custom");
    const { resolveSearchProvider } = await import("@/lib/server-config");
    (resolveSearchProvider as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const { POST } = await import("./route.js");
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "no-search-platform" }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/no search provider/i);
  });

  it("finds and saves resources on success", async () => {
    const { store } = await LocalFileStore.create("Researched Platform", "custom");
    const { resolveSearchProvider } = await import("@/lib/server-config");
    const { runResearchAgent } = await import("@scout/agents");
    (resolveSearchProvider as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "tavily", search: vi.fn() });
    (runResearchAgent as ReturnType<typeof vi.fn>).mockResolvedValue([
      { title: "Getting started", url: "https://example.com/a", snippet: "..." },
    ]);

    const { POST } = await import("./route.js");
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "researched-platform" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(await store.getResources()).toHaveLength(1);
  });

  it("returns a clear 502 when the search provider itself fails", async () => {
    await LocalFileStore.create("Failing Search Platform", "custom");
    const { resolveSearchProvider } = await import("@/lib/server-config");
    const { runResearchAgent } = await import("@scout/agents");
    (resolveSearchProvider as ReturnType<typeof vi.fn>).mockResolvedValue({ name: "tavily", search: vi.fn() });
    (runResearchAgent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Tavily search failed: HTTP 401"));

    const { POST } = await import("./route.js");
    const response = await POST(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ slug: "failing-search-platform" }),
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Tavily search failed: HTTP 401");
  });
});
