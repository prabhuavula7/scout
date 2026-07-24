import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileStore } from "@scout/store";

vi.mock("@/lib/server-config", () => ({
  resolveLLMProvider: vi.fn(async () => ({ name: "fake" })),
}));
vi.mock("@scout/agents", () => ({
  runRefresh: vi.fn(async () => undefined),
}));

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-refresh-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("POST /api/runs/[slug]/refresh", () => {
  it("404s for a run that doesn't exist", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(new Request("http://localhost", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ slug: "nope" }),
    });
    expect(response.status).toBe(404);
  });

  it("kicks off a resynthesize refresh without waiting for it, defaulting to resynthesize mode", async () => {
    await LocalFileStore.create("Test Platform", "custom");
    const { POST } = await import("./route.js");
    const { runRefresh } = await import("@scout/agents");

    const response = await POST(new Request("http://localhost", { method: "POST", body: "{}" }), {
      params: Promise.resolve({ slug: "test-platform" }),
    });

    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(runRefresh).toHaveBeenCalled());
    expect(vi.mocked(runRefresh).mock.calls[0]?.[4]).toBe("resynthesize");
  });

  it("persists crawlOptions and passes recrawl mode through when requested", async () => {
    await LocalFileStore.create("Test Platform 2", "custom");
    const { POST } = await import("./route.js");
    const { runRefresh } = await import("@scout/agents");

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ mode: "recrawl", docsDepth: 3, docsMaxPages: 80 }),
      }),
      { params: Promise.resolve({ slug: "test-platform-2" }) },
    );

    expect(response.status).toBe(202);
    await vi.waitFor(() => expect(runRefresh).toHaveBeenCalled());
    const call = vi.mocked(runRefresh).mock.calls[0];
    expect(call?.[4]).toBe("recrawl");
    expect(call?.[5]).toEqual({ maxDepth: 3, maxPages: 80 });

    const { store } = (await LocalFileStore.open("test-platform-2"))!;
    const platform = await store.getPlatform();
    expect(platform.crawlOptions).toEqual({ maxDepth: 3, maxPages: 80 });
  });
});
