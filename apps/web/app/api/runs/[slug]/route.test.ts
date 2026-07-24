import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore } from "@scout/store";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-run-detail-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("GET /api/runs/[slug]", () => {
  it("404s for a run that doesn't exist", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug: "nope" }) });
    expect(response.status).toBe(404);
  });

  it("returns the run with lastError null when it hasn't failed", async () => {
    await LocalFileStore.create("Fine Platform", "custom");
    const { GET } = await import("./route.js");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug: "fine-platform" }) });
    const body = await response.json();
    expect(body.lastError).toBeNull();
  });

  it("surfaces the most recent failure's error message when status is failed", async () => {
    const { store, platformId } = await LocalFileStore.create("Broken Platform", "custom");
    await store.setPlatformStatus(platformId, "failed");
    const { id } = await store.startAgentRun({ platformId, agent: "documentation", input: {} });
    await store.failAgentRun(id, "Failed to fetch docs page https://bad.example.com: HTTP 404");

    const { GET } = await import("./route.js");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug: "broken-platform" }) });
    const body = await response.json();
    expect(body.lastError).toBe("Failed to fetch docs page https://bad.example.com: HTTP 404");
  });
});

describe("DELETE /api/runs/[slug]", () => {
  it("removes an existing run", async () => {
    await LocalFileStore.create("To Delete", "custom");
    const { DELETE } = await import("./route.js");
    const response = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ slug: "to-delete" }) });
    expect(response.status).toBe(200);
    expect(await LocalFileStore.open("to-delete")).toBeNull();
  });

  it("404s when the run doesn't exist", async () => {
    const { DELETE } = await import("./route.js");
    const response = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ slug: "nope" }) });
    expect(response.status).toBe(404);
  });
});
