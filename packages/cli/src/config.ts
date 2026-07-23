import fs from "node:fs/promises";
import path from "node:path";
import { configPath } from "@scout/store";

interface ScoutConfig {
  openaiApiKey?: string;
  openaiChatModel?: string;
  openaiEmbeddingModel?: string;
  tavilyApiKey?: string;
}

export async function loadConfig(): Promise<ScoutConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf-8");
    return JSON.parse(raw) as ScoutConfig;
  } catch {
    return {};
  }
}

export async function saveConfig(patch: Partial<ScoutConfig>): Promise<ScoutConfig> {
  const current = await loadConfig();
  const next = { ...current, ...patch };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/**
 * Populates OPENAI_API_KEY (and model overrides) from ~/.scout/config.json
 * before any command that talks to the LLM provider runs, so users only
 * have to set the key once via `scout config set openai-api-key`. Actual
 * environment variables, if already set, always win.
 */
export async function applyConfigToEnv(): Promise<void> {
  const config = await loadConfig();
  if (config.openaiApiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = config.openaiApiKey;
  }
  if (config.openaiChatModel && !process.env.OPENAI_CHAT_MODEL) {
    process.env.OPENAI_CHAT_MODEL = config.openaiChatModel;
  }
  if (config.openaiEmbeddingModel && !process.env.OPENAI_EMBEDDING_MODEL) {
    process.env.OPENAI_EMBEDDING_MODEL = config.openaiEmbeddingModel;
  }
}
