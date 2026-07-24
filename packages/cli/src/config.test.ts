import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { upsertLLMProvider, upsertSearchProvider } from "@scout/store";
import { resolveLLMProvider, resolveSearchProvider } from "./config.js";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-cli-config-test-"));
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

describe("resolveLLMProvider", () => {
  it("errors on chat/embed when nothing is configured, without throwing at build time", async () => {
    const llm = await resolveLLMProvider();
    await expect(llm.complete({ system: "s", prompt: "p" })).rejects.toThrow(/No LLM provider configured/);
  });

  it("builds a usable provider once an entry is stored", async () => {
    await upsertLLMProvider({
      id: "openai-default",
      kind: "openai",
      apiKey: "sk-test",
      roles: ["chat", "embedding"],
      priority: 0,
      enabled: true,
    });
    const llm = await resolveLLMProvider();
    expect(llm.name).toContain("openai");
  });
});

describe("resolveSearchProvider", () => {
  it("returns undefined when nothing is configured", async () => {
    expect(await resolveSearchProvider()).toBeUndefined();
  });

  it("builds a provider once an entry is stored", async () => {
    await upsertSearchProvider({
      id: "tavily-default",
      kind: "tavily",
      apiKey: "tvly-test",
      priority: 0,
      enabled: true,
    });
    const search = await resolveSearchProvider();
    expect(search?.name).toBe("tavily");
  });
});
