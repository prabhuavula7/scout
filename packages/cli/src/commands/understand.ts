import { Command } from "commander";
import ora from "ora";
import { estimateCrawlCost, formatCrawlEstimate, runCoordinator } from "@scout/agents";
import { getConnector } from "@scout/connectors";
import { LocalFileStore } from "@scout/store";
import type { ImportRequest } from "@scout/types";
import { resolveLLMProvider } from "../config.js";
import { resolveSourceKind } from "../source-kind.js";

export function registerUnderstandCommand(program: Command): void {
  program
    .command("understand")
    .description("Point Scout at an OpenAPI/Swagger spec (URL or local file) and generate an integration blueprint")
    .argument("<source>", "OpenAPI/Swagger spec URL, or a path to a local spec file")
    .option("--docs <url>", "documentation page to crawl for grounded chat (repeatable)", (v, prev: string[]) => [...prev, v], [] as string[])
    .option("--docs-depth <n>", "hops of same-site links to follow past each --docs URL (0 = only the given URLs)", "1")
    .option("--docs-max-pages <n>", "hard cap on total doc pages crawled, regardless of depth", "20")
    .option("--label <name>", "human-readable name for this run (defaults to the spec title or connector name)")
    .option("--connector <slug>", "known connector slug (see `scout connectors list`) to prefill label/docs")
    .option("--kind <kind>", "override source kind: openapi_url | openapi_raw | swagger_url")
    .action(
      async (
        source: string,
        options: {
          docs: string[];
          docsDepth: string;
          docsMaxPages: string;
          label?: string;
          connector?: string;
          kind?: string;
        },
      ) => {
        const llm = await resolveLLMProvider();

        const connector = options.connector ? getConnector(options.connector) : undefined;
        if (options.connector && !connector) {
          console.error(`Unknown connector "${options.connector}". Run \`scout connectors list\` to see available ones.`);
          process.exitCode = 1;
          return;
        }

        const label = options.label ?? connector?.name ?? "platform";
        const docUrls = options.docs.length > 0 ? options.docs : connector?.suggestedDocsUrl ? [connector.suggestedDocsUrl] : [];
        const crawlOptions = { maxDepth: Number(options.docsDepth), maxPages: Number(options.docsMaxPages) };

        const { kind, value } = await resolveSourceKind(source, options.kind);
        const request: ImportRequest = {
          connectorSlug: connector?.slug,
          kind,
          value,
          label,
        };

        const { store, platformId } = await LocalFileStore.create(label, connector?.slug ?? "custom");
        await store.setDocUrls(docUrls);

        if (docUrls.length > 0) {
          const estimate = await estimateCrawlCost(docUrls, crawlOptions);
          console.log(formatCrawlEstimate(estimate));
        }

        const spinner = ora(`Understanding ${label}...`).start();
        try {
          await runCoordinator(store, platformId, request, docUrls, llm, crawlOptions);
          spinner.succeed(
            `Done. Run \`scout serve\`, \`scout chat ${store.slug}\`, or \`scout watch ${store.slug}\` to keep it fresh.`,
          );
          const platform = await store.getPlatform();
          if (platform.docsCrawlWarning) {
            console.log(`\nWarning: ${platform.docsCrawlWarning}`);
          }
          if (platform.understandingScopeWarning) {
            console.log(`\nWarning: ${platform.understandingScopeWarning}`);
          }
          const understanding = await store.getUnderstanding();
          if (understanding) {
            console.log(`\n${understanding.summary}\n`);
          }
        } catch (error) {
          spinner.fail(`Failed: ${error instanceof Error ? error.message : String(error)}`);
          process.exitCode = 1;
        }
      },
    );
}
