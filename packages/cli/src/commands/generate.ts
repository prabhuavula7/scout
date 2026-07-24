import fs from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { generateCode, parseAuthScheme, UnknownWorkflowError, type GenerateLang } from "@scout/agents";
import { LocalFileStore } from "@scout/store";

export function registerGenerateCommand(program: Command): void {
  program
    .command("generate")
    .description("Generate a runnable starter script (auth handshake + one read call) from a run's blueprint")
    .argument("<slug>", "the run slug, see `scout list`")
    .option("--lang <lang>", "ts or py", "ts")
    .option("--workflow <name>", "a commonWorkflows name to target (defaults to the first workflow)")
    .option("--out <path>", "write to a file instead of stdout; refuses to overwrite an existing file")
    .option("--list-workflows", "print this run's available workflow names and exit, instead of generating code")
    .action(async (slug: string, options: { lang: string; workflow?: string; out?: string; listWorkflows?: boolean }) => {
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

      if (options.listWorkflows) {
        if (understanding.commonWorkflows.length === 0) {
          console.log(`"${slug}" has no named workflows. \`scout generate\` will fall back to the first available endpoint.`);
        } else {
          for (const workflow of understanding.commonWorkflows) {
            console.log(workflow.name);
          }
        }
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

      let result;
      try {
        result = await generateCode(
          understanding,
          endpoints,
          { name: platform.name, slug: store.slug, baseUrl: platform.baseUrl, authScheme: parseAuthScheme(platform.authScheme) },
          options.workflow === undefined ? { lang } : { lang, workflow: options.workflow },
        );
      } catch (error) {
        if (error instanceof UnknownWorkflowError) {
          console.error(error.message);
          process.exitCode = 1;
          return;
        }
        throw error;
      }

      if (result.isStub) {
        console.error(`Warning: ${result.stubReason} -- generating an honest stub instead of a real script.`);
      } else if (result.syntaxValidated) {
        console.error(`Syntax validated (${lang === "ts" ? "node --check" : "python3 -m py_compile"}) -- not tested against the live API.`);
      } else {
        console.error(`Warning: syntax not validated (${result.syntaxValidationNote ?? "unknown reason"}).`);
      }

      if (options.out) {
        try {
          await fs.writeFile(options.out, result.code, { flag: "wx" });
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

        if (result.envExample) {
          const envPath = path.join(path.dirname(options.out), ".env.example");
          try {
            await fs.writeFile(envPath, result.envExample, { flag: "wx" });
            console.error(`Wrote ${envPath}`);
          } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "EEXIST") {
              console.error(`${envPath} already exists, left untouched.`);
            } else {
              console.error(`Couldn't write ${envPath}: ${error instanceof Error ? error.message : String(error)}`);
            }
          }
        }
      } else {
        console.log(result.code);
        if (result.envExample) {
          console.error(`\nSuggested .env.example:\n${result.envExample}`);
        }
      }
    });
}
