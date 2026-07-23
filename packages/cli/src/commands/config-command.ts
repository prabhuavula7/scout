import { Command } from "commander";
import { loadConfig, saveConfig } from "../config.js";

const KEY_MAP = {
  "openai-api-key": "openaiApiKey",
  "openai-chat-model": "openaiChatModel",
  "openai-embedding-model": "openaiEmbeddingModel",
  "tavily-api-key": "tavilyApiKey",
} as const;

type ConfigKey = keyof typeof KEY_MAP;

export function registerConfigCommand(program: Command): void {
  const config = program.command("config").description("Manage ~/.scout/config.json (API key, model overrides)");

  config
    .command("set")
    .argument("<key>", `one of: ${Object.keys(KEY_MAP).join(", ")}`)
    .argument("<value>", "value to store")
    .action(async (key: string, value: string) => {
      const mapped = KEY_MAP[key as ConfigKey];
      if (!mapped) {
        console.error(`Unknown config key "${key}". Supported: ${Object.keys(KEY_MAP).join(", ")}`);
        process.exitCode = 1;
        return;
      }
      await saveConfig({ [mapped]: value });
      console.log(`Saved ${key}.`);
    });

  config
    .command("get")
    .argument("[key]", "optional key to print; prints everything (with the API key masked) if omitted")
    .action(async (key?: string) => {
      const current = await loadConfig();
      if (key) {
        const mapped = KEY_MAP[key as ConfigKey];
        console.log(mapped ? (current[mapped] ?? "") : "");
        return;
      }
      console.log(
        JSON.stringify(
          {
            ...current,
            openaiApiKey: current.openaiApiKey ? "********" : undefined,
            tavilyApiKey: current.tavilyApiKey ? "********" : undefined,
          },
          null,
          2,
        ),
      );
    });
}
