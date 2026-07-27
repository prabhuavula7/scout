import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Command } from "commander";
import { runAgenticChatAgent, type ChatPlatform, type ChatSource } from "@scout/agents";
import { LocalFileStore, MultiRunThreadStore } from "@scout/store";
import { resolveLLMProvider, resolveSearchProvider } from "../config.js";
import { resolveThread } from "../resolve-thread.js";
import { resolveMultiThread } from "../resolve-multi-thread.js";

function describeSource(source: ChatSource, showPlatformTags: boolean): string {
  if (source.type === "model_knowledge") {
    return "[unverified: not from this platform's docs, the model's own general knowledge]";
  }
  const platformTag = showPlatformTags && source.platformName ? `${source.platformName}: ` : "";
  if (source.type === "web") return `[web] ${source.title ?? source.ref} (${source.ref})`;
  return `${platformTag}${source.title ?? source.ref} (${source.ref})`;
}

interface ThreadIO {
  getHistory(): Promise<Array<{ role: "user" | "assistant"; content: string }>>;
  appendUser(message: string): Promise<void>;
  appendAssistant(answer: string, sources: ChatSource[]): Promise<void>;
}

async function runChatRepl(
  platforms: ChatPlatform[],
  threadIO: ThreadIO,
  label: string,
  showPlatformTags: boolean,
): Promise<void> {
  const llm = await resolveLLMProvider();
  const searchProvider = await resolveSearchProvider();
  const history = await threadIO.getHistory();

  console.log(`${label} Type "exit" to quit.\n`);
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    for (;;) {
      let message: string;
      try {
        message = await rl.question("> ");
      } catch {
        break; // stdin closed (e.g. piped input ran out) instead of an explicit "exit"
      }
      if (message.trim().toLowerCase() === "exit") break;
      if (!message.trim()) continue;

      await threadIO.appendUser(message);
      const result = await runAgenticChatAgent(platforms, llm, searchProvider, message, history);
      await threadIO.appendAssistant(result.answer, result.sources);

      history.push({ role: "user", content: message }, { role: "assistant", content: result.answer });
      console.log(`\n${result.answer}\n`);
      if (result.sources.length > 0) {
        console.log(result.sources.map((s, i) => `  [${i + 1}] ${describeSource(s, showPlatformTags)}`).join("\n"));
        console.log("");
      }
    }
  } finally {
    rl.close();
  }
}

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description(
      "Chat with a platform, grounded in its indexed documentation, with real tool access (search, codegen, handoff briefs) and sourced answers. Pass a comma-separated list of slugs to chat across several platforms at once.",
    )
    .argument("<slugs>", "a run slug (see `scout list`), or a comma-separated list of slugs for a multi-platform conversation")
    .option("--thread <name>", "chat in a named thread instead of the default \"Main\" one; creates it if it doesn't exist yet. Required when chatting across multiple platforms.")
    .action(async (slugArg: string, options: { thread?: string }) => {
      const slugs = slugArg
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (slugs.length === 1) {
        const opened = await LocalFileStore.open(slugs[0]!);
        if (!opened) {
          console.error(`No run found for "${slugs[0]}". Run \`scout list\` to see what's available.`);
          process.exitCode = 1;
          return;
        }
        const { store, platformId } = opened;
        const platform = await store.getPlatform();
        const platforms: ChatPlatform[] = [{ platformId, slug: store.slug, name: platform.name, store }];

        const thread = await resolveThread(store, options.thread);
        await runChatRepl(
          platforms,
          {
            getHistory: async () => (await store.getChatHistory(thread.id)).map((m) => ({ role: m.role, content: m.content })),
            appendUser: (message) => store.appendChatMessage(thread.id, "user", message, []).then(() => undefined),
            appendAssistant: (answer, sources) => store.appendChatMessage(thread.id, "assistant", answer, sources).then(() => undefined),
          },
          `Chatting about "${platform.name}" (thread: ${thread.title}).`,
          false,
        );
        return;
      }

      if (!options.thread) {
        console.error(
          `Chatting across multiple platforms (${slugs.join(", ")}) needs --thread <name> to name the conversation; there's no default like "Main" for an arbitrary set of platforms.`,
        );
        process.exitCode = 1;
        return;
      }

      const platforms: ChatPlatform[] = [];
      for (const slug of slugs) {
        const opened = await LocalFileStore.open(slug);
        if (!opened) {
          console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
          process.exitCode = 1;
          return;
        }
        const platform = await opened.store.getPlatform();
        platforms.push({ platformId: opened.platformId, slug, name: platform.name, store: opened.store });
      }

      const thread = await resolveMultiThread(slugs, options.thread);
      await runChatRepl(
        platforms,
        {
          getHistory: async () => (await MultiRunThreadStore.getHistory(thread.id)).map((m) => ({ role: m.role, content: m.content })),
          appendUser: (message) => MultiRunThreadStore.appendMessage(thread.id, "user", message, []).then(() => undefined),
          appendAssistant: (answer, sources) => MultiRunThreadStore.appendMessage(thread.id, "assistant", answer, sources).then(() => undefined),
        },
        `Chatting about "${platforms.map((p) => p.name).join(", ")}" (thread: ${thread.title}).`,
        true,
      );
    });
}
