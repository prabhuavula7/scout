import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { LLMProviderKind, SearchProviderKind, maskScoutConfig, type LLMRole } from "@scout/types";
import {
  loadScoutConfig,
  removeLLMProvider,
  removeSearchProvider,
  upsertLLMProvider,
  upsertSearchProvider,
} from "@scout/store";

const LEGACY_KEY_MAP = {
  "openai-api-key": "apiKey",
  "openai-chat-model": "chatModel",
  "openai-embedding-model": "embeddingModel",
  "tavily-api-key": "tavilyApiKey",
} as const;

function parseRoles(value: string): LLMRole[] {
  const roles = value.split(",").map((r) => r.trim()) as LLMRole[];
  for (const role of roles) {
    if (role !== "chat" && role !== "embedding") {
      throw new Error(`Invalid role "${role}". Supported: chat, embedding`);
    }
  }
  return roles;
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("Manage ~/.scout/config.json: LLM and search provider keys, used in any combination with fallback");

  const llm = config
    .command("llm")
    .description("Manage LLM provider entries (openai, anthropic, azure-openai, openrouter, openai-compatible)");

  llm
    .command("add")
    .argument("<kind>", `one of: ${LLMProviderKind.options.join(", ")}`)
    .option("--api-key <key>", "API key (or a placeholder for endpoints that don't check one, e.g. local Ollama). Required unless --id refers to an existing entry, in which case its key is kept.")
    .option("--id <id>", "stable id: updates that entry in place if it already exists, otherwise creates it with this id (defaults to a random id for new entries)")
    .option("--label <label>", "human-readable name shown in the web viewer")
    .option("--base-url <url>", "required for openai-compatible; the Azure resource endpoint for azure-openai; optional override for openrouter")
    .option("--chat-model <model>", "chat model id (or Azure chat deployment name)")
    .option("--embedding-model <model>", "embedding model id (or Azure embedding deployment name)")
    .option("--azure-api-version <version>", "azure-openai only, defaults to 2024-10-21")
    .option("--roles <roles>", "comma-separated: chat, embedding, or both", "chat,embedding")
    .option("--priority <n>", "lower tried first within a role when multiple entries share it", "0")
    .option("--disabled", "add without enabling it (skipped in the fallback chain until re-enabled)")
    .action(
      async (
        kindInput: string,
        options: {
          apiKey?: string;
          id?: string;
          label?: string;
          baseUrl?: string;
          chatModel?: string;
          embeddingModel?: string;
          azureApiVersion?: string;
          roles: string;
          priority: string;
          disabled?: boolean;
        },
      ) => {
        const kind = LLMProviderKind.parse(kindInput);
        const roles = parseRoles(options.roles);

        if ((kind === "openai-compatible" || kind === "azure-openai") && !options.baseUrl) {
          console.error(`--base-url is required for "${kind}".`);
          process.exitCode = 1;
          return;
        }

        const existing = options.id ? (await loadScoutConfig()).llmProviders.find((e) => e.id === options.id) : undefined;
        if (!options.apiKey && !existing) {
          console.error("--api-key is required when adding a new provider.");
          process.exitCode = 1;
          return;
        }

        await upsertLLMProvider({
          id: options.id ?? randomUUID(),
          kind,
          label: options.label,
          apiKey: options.apiKey ?? existing!.apiKey,
          baseUrl: options.baseUrl,
          chatModel: options.chatModel,
          embeddingModel: options.embeddingModel,
          azureApiVersion: options.azureApiVersion,
          roles,
          priority: Number(options.priority),
          enabled: !options.disabled,
        });
        console.log(`Saved ${kind} provider${options.label ? ` "${options.label}"` : ""}.`);
      },
    );

  llm
    .command("enable")
    .argument("<id>", "id shown in `scout config llm list`")
    .action(async (id: string) => {
      const entry = (await loadScoutConfig()).llmProviders.find((e) => e.id === id);
      if (!entry) {
        console.error(`No LLM provider "${id}". Run \`scout config llm list\` to see what's configured.`);
        process.exitCode = 1;
        return;
      }
      await upsertLLMProvider({ ...entry, enabled: true });
      console.log(`Enabled "${id}".`);
    });

  llm
    .command("disable")
    .argument("<id>", "id shown in `scout config llm list`")
    .action(async (id: string) => {
      const entry = (await loadScoutConfig()).llmProviders.find((e) => e.id === id);
      if (!entry) {
        console.error(`No LLM provider "${id}". Run \`scout config llm list\` to see what's configured.`);
        process.exitCode = 1;
        return;
      }
      await upsertLLMProvider({ ...entry, enabled: false });
      console.log(`Disabled "${id}".`);
    });

  llm.command("list").action(async () => {
    const { llmProviders } = await loadScoutConfig();
    if (llmProviders.length === 0) {
      console.log(
        "No LLM providers configured. Add one to get started:\n" +
          "  scout config llm add openai --api-key sk-...\n" +
          "  scout config llm add anthropic --api-key sk-ant-...\n" +
          "  scout config llm add openai-compatible --base-url http://localhost:11434/v1 --api-key ollama --chat-model llama3.1  (local models via Ollama, LM Studio, vLLM, etc)\n" +
          "Or run `scout serve` and add one from the Settings tab.",
      );
      return;
    }
    for (const entry of [...llmProviders].sort((a, b) => a.priority - b.priority)) {
      console.log(
        `${entry.id}  ${entry.kind}  roles=${entry.roles.join("+")}  priority=${entry.priority}  ${entry.enabled ? "" : "(disabled) "}${entry.label ?? ""}`,
      );
    }
  });

  llm
    .command("remove")
    .argument("<id>", "id shown in `scout config llm list`")
    .action(async (id: string) => {
      await removeLLMProvider(id);
      console.log(`Removed "${id}".`);
    });

  const search = config
    .command("search")
    .description("Manage web search provider entries (tavily, serpapi), used by `scout research`");

  search
    .command("add")
    .argument("<kind>", `one of: ${SearchProviderKind.options.join(", ")}`)
    .option("--api-key <key>", "API key. Required unless --id refers to an existing entry, in which case its key is kept.")
    .option("--id <id>", "stable id: updates that entry in place if it already exists, otherwise creates it with this id (defaults to a random id for new entries)")
    .option("--label <label>", "human-readable name shown in the web viewer")
    .option("--priority <n>", "lower tried first when multiple entries are configured", "0")
    .option("--disabled", "add without enabling it (skipped in the fallback chain until re-enabled)")
    .action(async (kindInput: string, options: { apiKey?: string; id?: string; label?: string; priority: string; disabled?: boolean }) => {
      const kind = SearchProviderKind.parse(kindInput);
      const existing = options.id ? (await loadScoutConfig()).searchProviders.find((e) => e.id === options.id) : undefined;
      if (!options.apiKey && !existing) {
        console.error("--api-key is required when adding a new provider.");
        process.exitCode = 1;
        return;
      }
      await upsertSearchProvider({
        id: options.id ?? randomUUID(),
        kind,
        label: options.label,
        apiKey: options.apiKey ?? existing!.apiKey,
        priority: Number(options.priority),
        enabled: !options.disabled,
      });
      console.log(`Saved ${kind} search provider${options.label ? ` "${options.label}"` : ""}.`);
    });

  search.command("list").action(async () => {
    const { searchProviders } = await loadScoutConfig();
    if (searchProviders.length === 0) {
      console.log(
        "No search providers configured (optional; used by `scout research` and the web UI's related-articles button). Add one:\n" +
          "  scout config search add tavily --api-key tvly-...\n" +
          "  scout config search add serpapi --api-key <key>\n" +
          "Or run `scout serve` and add one from the Settings tab.",
      );
      return;
    }
    for (const entry of [...searchProviders].sort((a, b) => a.priority - b.priority)) {
      console.log(`${entry.id}  ${entry.kind}  priority=${entry.priority}  ${entry.enabled ? "" : "(disabled) "}${entry.label ?? ""}`);
    }
  });

  search
    .command("remove")
    .argument("<id>", "id shown in `scout config search list`")
    .action(async (id: string) => {
      await removeSearchProvider(id);
      console.log(`Removed "${id}".`);
    });

  search
    .command("enable")
    .argument("<id>", "id shown in `scout config search list`")
    .action(async (id: string) => {
      const entry = (await loadScoutConfig()).searchProviders.find((e) => e.id === id);
      if (!entry) {
        console.error(`No search provider "${id}". Run \`scout config search list\` to see what's configured.`);
        process.exitCode = 1;
        return;
      }
      await upsertSearchProvider({ ...entry, enabled: true });
      console.log(`Enabled "${id}".`);
    });

  search
    .command("disable")
    .argument("<id>", "id shown in `scout config search list`")
    .action(async (id: string) => {
      const entry = (await loadScoutConfig()).searchProviders.find((e) => e.id === id);
      if (!entry) {
        console.error(`No search provider "${id}". Run \`scout config search list\` to see what's configured.`);
        process.exitCode = 1;
        return;
      }
      await upsertSearchProvider({ ...entry, enabled: false });
      console.log(`Disabled "${id}".`);
    });

  // Legacy single-key shorthand, kept working for anyone with `scout config
  // set openai-api-key ...` in muscle memory or scripts; maps onto the same
  // fixed-id "openai-default" / "tavily-default" entries so it upserts in
  // place rather than creating duplicates alongside `llm add`/`search add`.
  config
    .command("set")
    .argument("<key>", `one of: ${Object.keys(LEGACY_KEY_MAP).join(", ")}`)
    .argument("<value>", "value to store")
    .action(async (key: string, value: string) => {
      const field = LEGACY_KEY_MAP[key as keyof typeof LEGACY_KEY_MAP];
      if (!field) {
        console.error(
          `Unknown config key "${key}". Supported: ${Object.keys(LEGACY_KEY_MAP).join(", ")}. For other providers, use \`scout config llm add\` / \`scout config search add\`.`,
        );
        process.exitCode = 1;
        return;
      }

      if (field === "tavilyApiKey") {
        const existing = (await loadScoutConfig()).searchProviders.find((e) => e.id === "tavily-default");
        await upsertSearchProvider({
          id: "tavily-default",
          kind: "tavily",
          label: "Tavily",
          apiKey: value,
          priority: existing?.priority ?? 0,
          enabled: true,
        });
      } else {
        const existing = (await loadScoutConfig()).llmProviders.find((e) => e.id === "openai-default");
        await upsertLLMProvider({
          id: "openai-default",
          kind: "openai",
          label: "OpenAI",
          apiKey: field === "apiKey" ? value : (existing?.apiKey ?? ""),
          chatModel: field === "chatModel" ? value : existing?.chatModel,
          embeddingModel: field === "embeddingModel" ? value : existing?.embeddingModel,
          roles: existing?.roles ?? ["chat", "embedding"],
          priority: existing?.priority ?? 0,
          enabled: true,
        });
      }
      console.log(`Saved ${key}.`);
    });

  config.command("get").action(async () => {
    console.log(JSON.stringify(maskScoutConfig(await loadScoutConfig()), null, 2));
  });
}
