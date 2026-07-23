import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyConfigToEnv, loadConfig, saveConfig } from "./config.js";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-cli-config-test-"));
  process.env.SCOUT_HOME = tmpHome;
  delete process.env.OPENAI_API_KEY;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  delete process.env.OPENAI_API_KEY;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("config", () => {
  it("returns an empty object when no config file exists yet", async () => {
    expect(await loadConfig()).toEqual({});
  });

  it("persists and merges patches across saves", async () => {
    await saveConfig({ openaiApiKey: "sk-test" });
    await saveConfig({ openaiChatModel: "gpt-5.5" });

    const current = await loadConfig();
    expect(current).toEqual({ openaiApiKey: "sk-test", openaiChatModel: "gpt-5.5" });
  });

  it("populates OPENAI_API_KEY from the saved config", async () => {
    await saveConfig({ openaiApiKey: "sk-from-config" });
    await applyConfigToEnv();
    expect(process.env.OPENAI_API_KEY).toBe("sk-from-config");
  });

  it("never overwrites an already-set environment variable", async () => {
    await saveConfig({ openaiApiKey: "sk-from-config" });
    process.env.OPENAI_API_KEY = "sk-from-real-env";
    await applyConfigToEnv();
    expect(process.env.OPENAI_API_KEY).toBe("sk-from-real-env");
  });
});
