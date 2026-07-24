import { Command } from "commander";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runChatAgent, runCoordinator } from "@scout/agents";
import { getConnector } from "@scout/connectors";
import { LocalFileStore } from "@scout/store";
import type { ImportRequest } from "@scout/types";
import { resolveLLMProvider } from "../config.js";
import { resolveSourceKind } from "../source-kind.js";

/**
 * Exposes Scout's core (the same coordinator/chat agents the CLI and local
 * viewer use) as MCP tools, so Claude Code, Codex, Gemini CLI, or any other
 * MCP-speaking agent can call `understand_platform`/`ask_platform` directly
 * mid-session instead of a human running `scout understand` by hand first.
 */
export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Run Scout as an MCP server (stdio) so coding agents can call it as a tool")
    .action(async () => {
      const server = new McpServer({ name: "scout", version: "1.0.0" });

      server.tool(
        "understand_platform",
        "Point Scout at an OpenAPI/Swagger spec (URL) and generate an integration blueprint: architecture, auth flow, data model, workflows, pitfalls. Stores the run locally under the returned slug for later ask_platform calls.",
        {
          specUrl: z.string().url().describe("OpenAPI/Swagger spec URL"),
          docUrls: z.array(z.string().url()).optional().describe("Documentation pages to crawl for grounded chat"),
          label: z.string().optional().describe("Human-readable name for this run"),
          connectorSlug: z.string().optional().describe("Known connector slug, see list_connectors"),
        },
        async ({ specUrl, docUrls, label, connectorSlug }) => {
          const connector = connectorSlug ? getConnector(connectorSlug) : undefined;
          const resolvedLabel = label ?? connector?.name ?? "platform";
          const resolvedDocUrls = docUrls ?? (connector?.suggestedDocsUrl ? [connector.suggestedDocsUrl] : []);

          const { kind, value } = await resolveSourceKind(specUrl);
          const request: ImportRequest = { connectorSlug: connector?.slug, kind, value, label: resolvedLabel };

          const { store, platformId } = await LocalFileStore.create(resolvedLabel, connector?.slug ?? "custom");
          await store.setDocUrls(resolvedDocUrls);

          try {
            const llm = await resolveLLMProvider();
            await runCoordinator(store, platformId, request, resolvedDocUrls, llm);
            const understanding = await store.getUnderstanding();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ slug: store.slug, status: "ready", understanding }, null, 2),
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

      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
