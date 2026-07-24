import fs from "node:fs/promises";
import path from "node:path";
import type { LLMProviderEntry, ScoutConfig, SearchProviderEntry } from "@scout/types";
import { configPath } from "./paths.js";

/** Pre-multi-provider config.json shape (single OpenAI + single Tavily key). */
interface LegacyScoutConfig {
  openaiApiKey?: string;
  openaiChatModel?: string;
  openaiEmbeddingModel?: string;
  tavilyApiKey?: string;
}

function isLegacyShape(raw: unknown): raw is LegacyScoutConfig {
  if (!raw || typeof raw !== "object") return false;
  return !("llmProviders" in raw) && !("searchProviders" in raw);
}

function migrateLegacyConfig(legacy: LegacyScoutConfig): ScoutConfig {
  const llmProviders: LLMProviderEntry[] = [];
  const searchProviders: SearchProviderEntry[] = [];

  if (legacy.openaiApiKey) {
    llmProviders.push({
      id: "openai-default",
      kind: "openai",
      label: "OpenAI",
      apiKey: legacy.openaiApiKey,
      chatModel: legacy.openaiChatModel,
      embeddingModel: legacy.openaiEmbeddingModel,
      roles: ["chat", "embedding"],
      priority: 0,
      enabled: true,
    });
  }
  if (legacy.tavilyApiKey) {
    searchProviders.push({
      id: "tavily-default",
      kind: "tavily",
      label: "Tavily",
      apiKey: legacy.tavilyApiKey,
      priority: 0,
      enabled: true,
    });
  }

  return { llmProviders, searchProviders };
}

async function readRawConfig(): Promise<ScoutConfig> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(configPath(), "utf-8"));
  } catch {
    return { llmProviders: [], searchProviders: [] };
  }

  if (isLegacyShape(raw)) {
    const migrated = migrateLegacyConfig(raw as LegacyScoutConfig);
    // Persist the migration immediately so it only ever runs once per
    // install, and every reader (CLI, web viewer) sees the same shape.
    await writeRawConfig(migrated);
    return migrated;
  }

  const parsed = raw as Partial<ScoutConfig>;
  return {
    llmProviders: parsed.llmProviders ?? [],
    searchProviders: parsed.searchProviders ?? [],
  };
}

async function writeRawConfig(config: ScoutConfig): Promise<void> {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Loads the persisted multi-provider config, migrating an older
 * single-OpenAI-key config.json in place if found. When nothing has been
 * configured at all yet, synthesizes a provider entry from OPENAI_API_KEY /
 * TAVILY_API_KEY environment variables (never written back to disk), so
 * the zero-config .env workflow every existing user and the dormant hosted
 * mode already rely on keeps working without requiring `scout config`.
 */
export async function loadScoutConfig(): Promise<ScoutConfig> {
  const config = await readRawConfig();

  if (config.llmProviders.length === 0 && process.env.OPENAI_API_KEY) {
    config.llmProviders.push({
      id: "env-openai",
      kind: "openai",
      label: "OpenAI (from environment)",
      apiKey: process.env.OPENAI_API_KEY,
      chatModel: process.env.OPENAI_CHAT_MODEL,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
      roles: ["chat", "embedding"],
      priority: 0,
      enabled: true,
    });
  }

  if (config.searchProviders.length === 0 && process.env.TAVILY_API_KEY) {
    config.searchProviders.push({
      id: "env-tavily",
      kind: "tavily",
      label: "Tavily (from environment)",
      apiKey: process.env.TAVILY_API_KEY,
      priority: 0,
      enabled: true,
    });
  }

  return config;
}

export async function saveScoutConfig(config: ScoutConfig): Promise<void> {
  await writeRawConfig(config);
}

/** Upserts one LLM provider entry by id, then persists the whole config. */
export async function upsertLLMProvider(entry: LLMProviderEntry): Promise<ScoutConfig> {
  const config = await readRawConfig();
  const index = config.llmProviders.findIndex((e) => e.id === entry.id);
  if (index >= 0) {
    config.llmProviders[index] = entry;
  } else {
    config.llmProviders.push(entry);
  }
  await writeRawConfig(config);
  return config;
}

export async function removeLLMProvider(id: string): Promise<ScoutConfig> {
  const config = await readRawConfig();
  config.llmProviders = config.llmProviders.filter((e) => e.id !== id);
  await writeRawConfig(config);
  return config;
}

export async function upsertSearchProvider(entry: SearchProviderEntry): Promise<ScoutConfig> {
  const config = await readRawConfig();
  const index = config.searchProviders.findIndex((e) => e.id === entry.id);
  if (index >= 0) {
    config.searchProviders[index] = entry;
  } else {
    config.searchProviders.push(entry);
  }
  await writeRawConfig(config);
  return config;
}

export async function removeSearchProvider(id: string): Promise<ScoutConfig> {
  const config = await readRawConfig();
  config.searchProviders = config.searchProviders.filter((e) => e.id !== id);
  await writeRawConfig(config);
  return config;
}
