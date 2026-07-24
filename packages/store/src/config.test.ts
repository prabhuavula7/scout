import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadScoutConfig,
  removeLLMProvider,
  saveScoutConfig,
  upsertLLMProvider,
  upsertSearchProvider,
} from "./config.js";
import { configPath } from "./paths.js";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-store-config-test-"));
  process.env.SCOUT_HOME = tmpHome;
  delete process.env.OPENAI_API_KEY;
  delete process.env.TAVILY_API_KEY;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  delete process.env.OPENAI_API_KEY;
  delete process.env.TAVILY_API_KEY;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("loadScoutConfig", () => {
  it("returns empty arrays when nothing is configured", async () => {
    expect(await loadScoutConfig()).toEqual({ llmProviders: [], searchProviders: [] });
  });

  it("migrates a legacy single-OpenAI-key config.json in place", async () => {
    await fs.mkdir(tmpHome, { recursive: true });
    await fs.writeFile(
      configPath(),
      JSON.stringify({ openaiApiKey: "sk-legacy", tavilyApiKey: "tvly-legacy" }),
      "utf-8",
    );

    const config = await loadScoutConfig();
    expect(config.llmProviders).toHaveLength(1);
    expect(config.llmProviders[0]!.apiKey).toBe("sk-legacy");
    expect(config.llmProviders[0]!.roles).toEqual(["chat", "embedding"]);
    expect(config.searchProviders[0]!.apiKey).toBe("tvly-legacy");

    // Migration persists: a second load reads the new shape directly.
    const raw = JSON.parse(await fs.readFile(configPath(), "utf-8"));
    expect(raw.llmProviders).toBeDefined();
    expect(raw.openaiApiKey).toBeUndefined();
  });

  it("synthesizes an entry from environment variables when nothing is stored", async () => {
    process.env.OPENAI_API_KEY = "sk-from-env";
    process.env.TAVILY_API_KEY = "tvly-from-env";

    const config = await loadScoutConfig();
    expect(config.llmProviders[0]!.apiKey).toBe("sk-from-env");
    expect(config.searchProviders[0]!.apiKey).toBe("tvly-from-env");

    // Env-synthesized entries are never written back to disk.
    await expect(fs.readFile(configPath(), "utf-8")).rejects.toThrow();
  });

  it("prefers a stored entry over environment variables", async () => {
    await saveScoutConfig({
      llmProviders: [
        {
          id: "openai-default",
          kind: "openai",
          apiKey: "sk-stored",
          roles: ["chat", "embedding"],
          priority: 0,
          enabled: true,
        },
      ],
      searchProviders: [],
    });
    process.env.OPENAI_API_KEY = "sk-from-env";

    const config = await loadScoutConfig();
    expect(config.llmProviders).toHaveLength(1);
    expect(config.llmProviders[0]!.apiKey).toBe("sk-stored");
  });
});

describe("upsertLLMProvider / removeLLMProvider", () => {
  it("adds, updates, and removes an entry by id", async () => {
    await upsertLLMProvider({
      id: "anthropic-1",
      kind: "anthropic",
      apiKey: "sk-ant-1",
      roles: ["chat"],
      priority: 0,
      enabled: true,
    });
    let config = await loadScoutConfig();
    expect(config.llmProviders).toHaveLength(1);

    await upsertLLMProvider({
      id: "anthropic-1",
      kind: "anthropic",
      apiKey: "sk-ant-2",
      roles: ["chat"],
      priority: 0,
      enabled: true,
    });
    config = await loadScoutConfig();
    expect(config.llmProviders).toHaveLength(1);
    expect(config.llmProviders[0]!.apiKey).toBe("sk-ant-2");

    await removeLLMProvider("anthropic-1");
    config = await loadScoutConfig();
    expect(config.llmProviders).toHaveLength(0);
  });
});

describe("upsertSearchProvider", () => {
  it("adds a search provider entry", async () => {
    await upsertSearchProvider({
      id: "serpapi-1",
      kind: "serpapi",
      apiKey: "serp-key",
      priority: 1,
      enabled: true,
    });
    const config = await loadScoutConfig();
    expect(config.searchProviders).toHaveLength(1);
    expect(config.searchProviders[0]!.kind).toBe("serpapi");
  });
});
