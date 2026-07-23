import { Command } from "commander";
import ora from "ora";
import { runCoordinator } from "@scout/agents";
import { getConnector } from "@scout/connectors";
import { LocalFileStore } from "@scout/store";
import type { ImportRequest } from "@scout/types";
import { applyConfigToEnv } from "../config.js";
import { resolveSourceKind } from "../source-kind.js";

export function registerUnderstandCommand(program: Command): void {
  program
    .command("understand")
    .description("Point Scout at an OpenAPI/Swagger spec (URL or local file) and generate an integration blueprint")
    .argument("<source>", "OpenAPI/Swagger spec URL, or a path to a local spec file")
    .option("--docs <url>", "documentation page to crawl for grounded chat (repeatable)", (v, prev: string[]) => [...prev, v], [] as string[])
    .option("--label <name>", "human-readable name for this run (defaults to the spec title or connector name)")
    .option("--connector <slug>", "known connector slug (see `scout connectors list`) to prefill label/docs")
    .option("--kind <kind>", "override source kind: openapi_url | openapi_raw | swagger_url")
    .action(async (source: string, options: { docs: string[]; label?: string; connector?: string; kind?: string }) => {
      await applyConfigToEnv();

      const connector = options.connector ? getConnector(options.connector) : undefined;
      if (options.connector && !connector) {
        console.error(`Unknown connector "${options.connector}". Run \`scout connectors list\` to see available ones.`);
        process.exitCode = 1;
        return;
      }

      const label = options.label ?? connector?.name ?? "platform";
      const docUrls = options.docs.length > 0 ? options.docs : connector?.suggestedDocsUrl ? [connector.suggestedDocsUrl] : [];

      const { kind, value } = await resolveSourceKind(source, options.kind);
      const request: ImportRequest = {
        connectorSlug: connector?.slug,
        kind,
        value,
        label,
      };

      const { store, platformId } = await LocalFileStore.create(label, connector?.slug ?? "custom");
      await store.setDocUrls(docUrls);

      const spinner = ora(`Understanding ${label}...`).start();
      try {
        await runCoordinator(store, platformId, request, docUrls);
        spinner.succeed(
          `Done. Run \`scout serve\`, \`scout chat ${store.slug}\`, or \`scout watch ${store.slug}\` to keep it fresh.`,
        );
        const understanding = await store.getUnderstanding();
        if (understanding) {
          console.log(`\n${understanding.summary}\n`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
    });
}
