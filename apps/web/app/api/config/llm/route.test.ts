import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-config-llm-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("POST /api/config/llm", () => {
  it("requires an API key when adding a brand-new entry", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ kind: "openai", roles: ["chat", "embedding"], priority: 0, enabled: true }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("requires a base URL for openai-compatible entries", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          kind: "openai-compatible",
          apiKey: "not-required",
          roles: ["chat"],
          priority: 0,
          enabled: true,
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("adds a new entry and keeps the existing key on a later update that omits it", async () => {
    const { POST } = await import("./route.js");

    const created = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({
          kind: "anthropic",
          label: "Test",
          apiKey: "sk-ant-real",
          roles: ["chat"],
          priority: 0,
          enabled: true,
        }),
      }),
    );
    const createdBody = await created.json();
    const id = createdBody.llmProviders[0].id;
    expect(createdBody.llmProviders[0].apiKeySet).toBe(true);

    // Relabel without resending the key.
    const updated = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ id, kind: "anthropic", label: "Renamed", roles: ["chat"], priority: 0, enabled: true }),
      }),
    );
    const updatedBody = await updated.json();
    expect(updatedBody.llmProviders).toHaveLength(1);
    expect(updatedBody.llmProviders[0].label).toBe("Renamed");
    expect(updatedBody.llmProviders[0].apiKeySet).toBe(true);
  });
});
