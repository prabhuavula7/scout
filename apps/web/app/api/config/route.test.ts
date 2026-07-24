import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upsertLLMProvider } from "@scout/store";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-config-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
  delete process.env.OPENAI_API_KEY;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("GET /api/config", () => {
  it("never returns a raw API key, only whether one is set", async () => {
    await upsertLLMProvider({
      id: "openai-default",
      kind: "openai",
      apiKey: "sk-super-secret",
      roles: ["chat", "embedding"],
      priority: 0,
      enabled: true,
    });

    const { GET } = await import("./route.js");
    const response = await GET();
    const body = await response.json();

    expect(body.llmProviders).toHaveLength(1);
    expect(body.llmProviders[0].apiKeySet).toBe(true);
    expect(JSON.stringify(body)).not.toContain("sk-super-secret");
  });
});
