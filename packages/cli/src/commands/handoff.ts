import fs from "node:fs/promises";
import { Command } from "commander";
import {
  assembleHandoff,
  parseAuthScheme,
  summarizeThreadForHandoff,
  UnknownWorkflowError,
  type GenerateLang,
} from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { copyToClipboard } from "../clipboard.js";
import { resolveLLMProvider } from "../config.js";

export function registerHandoffCommand(program: Command): void {
  program
    .command("handoff")
    .description("Assemble a paste-ready integration brief (task, auth, starter code, pitfalls) for a coding agent")
    .argument("<slug>", "the run slug, see `scout list`")
    .option("--lang <lang>", "ts or py", "ts")
    .option("--workflow <name>", "a commonWorkflows name to target (defaults to the first workflow)")
    .option("--out <path>", "write to a file instead of stdout; refuses to overwrite an existing file")
    .option("--copy", "copy the brief to your system clipboard instead of printing it")
    .option("--thread <name>", "fold a named thread's conversation into the brief as an LLM-summarized 'already figured out' section")
    .action(async (slug: string, options: { lang: string; workflow?: string; out?: string; copy?: boolean; thread?: string }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        console.error(`No run found for "${slug}". Run \`scout list\` to see what's available.`);
        process.exitCode = 1;
        return;
      }
      const { store } = opened;

      const understanding = await store.getUnderstanding();
      if (!understanding) {
        console.error(`No understanding generated yet for "${slug}". Run \`scout understand\` first.`);
        process.exitCode = 1;
        return;
      }

      if (options.lang !== "ts" && options.lang !== "py") {
        console.error(`Unknown --lang "${options.lang}". Use "ts" or "py".`);
        process.exitCode = 1;
        return;
      }
      const lang: GenerateLang = options.lang;

      const endpoints = await store.getEndpoints();
      const platform = await store.getPlatform();

      let threadSummary: string | undefined;
      if (options.thread) {
        const threads = await store.listChatThreads();
        const thread = threads.find((t) => t.title === options.thread);
        if (!thread) {
          const available = threads.map((t) => t.title).join(", ") || "(none yet)";
          console.error(`No thread named "${options.thread}" for "${slug}". Available threads: ${available}`);
          process.exitCode = 1;
          return;
        }
        const history = await store.getChatHistory(thread.id);
        if (history.length > 0) {
          const llm = await resolveLLMProvider();
          threadSummary = await summarizeThreadForHandoff(
            llm,
            history.map((m) => ({ role: m.role, content: m.content })),
          );
        }
      }

      let result;
      try {
        result = await assembleHandoff(
          understanding,
          endpoints,
          { name: platform.name, slug: store.slug, baseUrl: platform.baseUrl, authScheme: parseAuthScheme(platform.authScheme) },
          {
            lang,
            ...(options.workflow === undefined ? {} : { workflow: options.workflow }),
            ...(threadSummary ? { threadSummary } : {}),
          },
        );
      } catch (error) {
        if (error instanceof UnknownWorkflowError) {
          console.error(error.message);
          process.exitCode = 1;
          return;
        }
        throw error;
      }

      if (result.generatedCode.isStub) {
        console.error(`Warning: ${result.generatedCode.stubReason} -- the embedded script is an honest stub, not a real script.`);
      }

      if (options.out) {
        try {
          await fs.writeFile(options.out, result.markdown, { flag: "wx" });
          console.error(`Wrote ${options.out}`);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "EEXIST") {
            console.error(`"${options.out}" already exists. Choose a different path or remove it first.`);
          } else {
            console.error(`Couldn't write ${options.out}: ${error instanceof Error ? error.message : String(error)}`);
          }
          process.exitCode = 1;
          return;
        }
      }

      if (options.copy) {
        try {
          await copyToClipboard(result.markdown);
          console.error("Copied to clipboard.");
        } catch (error) {
          console.error(`Couldn't copy to clipboard: ${error instanceof Error ? error.message : String(error)}`);
          if (!options.out) console.log(result.markdown);
          process.exitCode = 1;
        }
      } else if (!options.out) {
        console.log(result.markdown);
      }
    });
}
