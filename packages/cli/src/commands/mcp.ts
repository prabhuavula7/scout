import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runChatAgent, runCoordinator, runRefresh, runResearchAgent } from "@scout/agents";
import { getConnector, loadConnectorRegistry } from "@scout/connectors";
import { LocalFileStore } from "@scout/store";
import type { ImportRequest } from "@scout/types";
import { resolveLLMProvider, resolveSearchProvider } from "../config.js";
import { resolveSourceKind } from "../source-kind.js";
import { toMarkdown } from "./export.js";

/**
 * Exposes Scout's core (the same coordinator/refresh/chat/research agents
 * the CLI and local viewer use) as MCP tools, so Claude Code, Codex, Gemini
 * CLI, or any other MCP-speaking agent can drive the same tasks a human
 * would run by hand: import + understand a platform, ask grounded questions,
 * refresh a run when docs change, export the result, find further reading,
 * and clean up. Every tool here is a thin wrapper around the exact agent/
 * store functions the CLI commands and web API routes call, so parity with
 * `scout <command>` isn't a promise to keep in sync by hand, it's structural.
 */
export function createScoutMcpServer(): McpServer {
  const server = new McpServer({ name: "scout", version: "1.0.0" });

  server.tool(
    "understand_platform",
    "Point Scout at an OpenAPI/Swagger spec (URL) and generate an integration blueprint: architecture, auth flow, data model, workflows, pitfalls. Stores the run locally under the returned slug for later ask_platform/refresh_platform/export_platform calls.",
    {
      specUrl: z.string().url().describe("OpenAPI/Swagger spec URL"),
      docUrls: z.array(z.string().url()).optional().describe("Documentation pages to crawl for grounded chat"),
      label: z.string().optional().describe("Human-readable name for this run"),
      connectorSlug: z.string().optional().describe("Known connector slug, see list_connectors"),
      docsDepth: z.number().int().min(0).optional().describe("Hops of same-site links to follow past each doc URL (default 2)"),
      docsMaxPages: z.number().int().min(1).optional().describe("Hard cap on total doc pages crawled (default 50)"),
    },
    async ({ specUrl, docUrls, label, connectorSlug, docsDepth, docsMaxPages }) => {
      const connector = connectorSlug ? getConnector(connectorSlug) : undefined;
      const resolvedLabel = label ?? connector?.name ?? "platform";
      const resolvedDocUrls = docUrls ?? (connector?.suggestedDocsUrl ? [connector.suggestedDocsUrl] : []);
      const crawlOptions = { maxDepth: docsDepth ?? 2, maxPages: docsMaxPages ?? 50 };

      const { kind, value } = await resolveSourceKind(specUrl);
      const request: ImportRequest = { connectorSlug: connector?.slug, kind, value, label: resolvedLabel };

      const { store, platformId } = await LocalFileStore.create(resolvedLabel, connector?.slug ?? "custom");
      await store.setDocUrls(resolvedDocUrls);
      await store.setCrawlOptions(crawlOptions.maxDepth, crawlOptions.maxPages);

      try {
        const llm = await resolveLLMProvider();
        await runCoordinator(store, platformId, request, resolvedDocUrls, llm, crawlOptions);
        const understanding = await store.getUnderstanding();
        const platform = await store.getPlatform();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  slug: store.slug,
                  status: "ready",
                  crawlWarning: platform.docsCrawlWarning ?? null,
                  scopeWarning: platform.understandingScopeWarning ?? null,
                  understanding,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        };
      }
    },
  );

  server.tool(
    "ask_platform",
    "Ask a grounded, cited question about a platform Scout has already analyzed (see list_platforms for available slugs).",
    {
      slug: z.string().describe("The run slug from understand_platform or list_platforms"),
      question: z.string(),
    },
    async ({ slug, question }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        return { isError: true, content: [{ type: "text", text: `No run found for "${slug}".` }] };
      }
      const { store, platformId } = opened;

      const priorMessages = await store.getChatHistory();
      const history = priorMessages.map((m) => ({ role: m.role, content: m.content }));

      await store.appendChatMessage("user", question, []);
      const llm = await resolveLLMProvider();
      const result = await runChatAgent(store, llm, platformId, question, history);
      await store.appendChatMessage("assistant", result.answer, result.citations);

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool("list_platforms", "List every platform Scout has already analyzed, with slug and status.", {}, async () => {
    const runs = await LocalFileStore.list();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            runs.map((r) => ({ slug: r.slug, name: r.name, status: r.status })),
            null,
            2,
          ),
        },
      ],
    };
  });

  server.tool(
    "list_connectors",
    "List Scout's known connectors (slug, name, category, whether the generic pipeline has been verified against it), for use as understand_platform's connectorSlug.",
    {},
    async () => {
      const connectors = loadConnectorRegistry();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              connectors.map((c) => ({
                slug: c.slug,
                name: c.name,
                category: c.category,
                implemented: c.implemented,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "refresh_platform",
    "Regenerate a run's understanding without re-importing its spec. Plain refresh re-synthesizes from whatever's already crawled and stored (picks up config/prompt-scope changes immediately, no network calls). recrawl=true also re-fetches the run's doc URLs first (needed when the doc set itself changed).",
    {
      slug: z.string().describe("The run slug, see list_platforms"),
      recrawl: z.boolean().optional().describe("Also re-fetch doc URLs before resynthesizing (default false)"),
    },
    async ({ slug, recrawl }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        return { isError: true, content: [{ type: "text", text: `No run found for "${slug}".` }] };
      }
      const { store, platformId } = opened;
      const platform = await store.getPlatform();
      const docUrls = platform.docUrls ?? [];
      const crawlOptions = platform.crawlOptions ?? { maxDepth: 2, maxPages: 50 };

      try {
        const llm = await resolveLLMProvider();
        await runRefresh(store, platformId, llm, docUrls, recrawl ? "recrawl" : "resynthesize", crawlOptions);
        const understanding = await store.getUnderstanding();
        const refreshed = await store.getPlatform();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  slug: store.slug,
                  status: refreshed.status,
                  crawlWarning: refreshed.docsCrawlWarning ?? null,
                  scopeWarning: refreshed.understandingScopeWarning ?? null,
                  understanding,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        };
      }
    },
  );

  server.tool(
    "export_platform",
    "Export a run's understanding as Markdown or JSON, the same content `scout export`/the web app's export button produce.",
    {
      slug: z.string().describe("The run slug, see list_platforms"),
      format: z.enum(["md", "json"]).optional().describe("Defaults to md"),
    },
    async ({ slug, format }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        return { isError: true, content: [{ type: "text", text: `No run found for "${slug}".` }] };
      }
      const { store } = opened;
      const understanding = await store.getUnderstanding();
      if (!understanding) {
        return { isError: true, content: [{ type: "text", text: `No understanding generated yet for "${slug}".` }] };
      }
      const platform = await store.getPlatform();
      const resources = await store.getResources();
      const text =
        format === "json" ? JSON.stringify({ ...understanding, resources }, null, 2) : toMarkdown(platform.name, understanding, resources);
      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "research_platform",
    "Find related articles, tutorials, and real-world use cases for a run via the configured web search provider (Tavily/SerpApi).",
    {
      slug: z.string().describe("The run slug, see list_platforms"),
    },
    async ({ slug }) => {
      const opened = await LocalFileStore.open(slug);
      if (!opened) {
        return { isError: true, content: [{ type: "text", text: `No run found for "${slug}".` }] };
      }
      const { store } = opened;

      const searchProvider = await resolveSearchProvider();
      if (!searchProvider) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "No search provider configured. Run: scout config search add tavily --api-key <key>",
            },
          ],
        };
      }

      const platform = await store.getPlatform();
      const resources = await runResearchAgent(searchProvider, platform.name);
      await store.saveResources(resources);
      return { content: [{ type: "text", text: JSON.stringify(resources, null, 2) }] };
    },
  );

  server.tool(
    "remove_platform",
    "Delete a run and everything under it (understanding, chat history, doc chunks). Irreversible, so requires confirm=true.",
    {
      slug: z.string().describe("The run slug, see list_platforms"),
      confirm: z.boolean().describe("Must be true to actually delete; this cannot be undone"),
    },
    async ({ slug, confirm }) => {
      if (!confirm) {
        return {
          isError: true,
          content: [{ type: "text", text: "Pass confirm=true to actually delete this run. This cannot be undone." }],
        };
      }
      const removed = await LocalFileStore.remove(slug);
      if (!removed) {
        return { isError: true, content: [{ type: "text", text: `No run found for "${slug}".` }] };
      }
      return { content: [{ type: "text", text: `Removed "${slug}".` }] };
    },
  );

  return server;
}

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Run Scout as an MCP server (stdio) so coding agents can call it as a tool")
    .action(async () => {
      const server = createScoutMcpServer();
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
