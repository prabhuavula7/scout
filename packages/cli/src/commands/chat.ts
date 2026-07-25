import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Command } from "commander";
import { runAgenticChatAgent } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider, resolveSearchProvider } from "../config.js";

function describeSource(source: { type: "docs" | "web" | "model_knowledge"; ref: string; title?: string }): string {
  if (source.type === "docs") return `${source.title ?? source.ref} (${source.ref})`;
  if (source.type === "web") return `[web] ${source.title ?? source.ref} (${source.ref})`;
  return "[unverified: not from this platform's docs, the model's own general knowledge]";
}

export function registerChatCommand(program: Command): void {
  program
    .command("chat")
    .description("Chat with a platform, grounded in its indexed documentation, with real tool access (search, codegen, handoff briefs) and sourced answers")
    .argument("<slug>", "the run slug, see `scout list`")
    .action(async (slug: string) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store, platformId } = opened;
      const llm = await resolveLLMProvider();
      const searchProvider = await resolveSearchProvider();

      const priorMessages = await store.getChatHistory();
      const history = priorMessages.map((m) => ({ role: m.role, content: m.content }));

      console.log(`Chatting about "${(await store.getPlatform()).name}". Type "exit" to quit.\n`);
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

          await store.appendChatMessage("user", message, []);
          const result = await runAgenticChatAgent(store, llm, searchProvider, platformId, message, history);
          await store.appendChatMessage("assistant", result.answer, result.sources);

          history.push({ role: "user", content: message }, { role: "assistant", content: result.answer });
          console.log(`\n${result.answer}\n`);
          if (result.sources.length > 0) {
            console.log(result.sources.map((s, i) => `  [${i + 1}] ${describeSource(s)}`).join("\n"));
            console.log("");
          }
        }
      } finally {
        rl.close();
      }
    });
}
