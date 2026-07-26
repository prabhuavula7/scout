import { z } from "zod";
import type { LLMProvider, ToolCallRequest, ToolDefinition, ToolLoopMessage } from "@scout/ai";
import type { LocalFileStore } from "@scout/store";
import { stripEmDashes } from "./base.js";
import { runChatAgent } from "./chat-agent.js";
import { generateCode, parseAuthScheme, UnknownWorkflowError, type GenerateCodePlatform } from "./generate-code.js";
import { assembleHandoff } from "./assemble-handoff.js";
import type { SearchProvider } from "./search/provider.js";

/**
 * Where a piece of an answer actually came from. "docs" carries the real
 * hybridSearch cosine score, never a fabricated confidence number. "web"
 * carries the URL a live search actually returned. "model_knowledge" means
 * the model answered without calling any tool this turn -- there is nothing
 * to cite, so it's flagged as unverified rather than given a fake source.
 */
export interface ChatSource {
  type: "docs" | "web" | "model_knowledge";
  ref: string;
  title?: string;
  score?: number;
}

export interface AgenticChatResult {
  answer: string;
  sources: ChatSource[];
}

const SYSTEM_PROMPT = `You are Scout's integration assistant for a platform a developer has already imported. You have tools:
- search_docs: search this platform's own crawled documentation. Prefer this before answering any factual question about the platform.
- web_search: search the live web for outside context (only available if configured). Results from this are NOT the platform's own docs -- treat them as supplementary, not authoritative.
- generate_starter_code: generate a real, syntax-checked starter script (auth handshake + one read call) from this run's blueprint.
- assemble_handoff: assemble a paste-ready integration brief (task, auth, starter code, pitfalls) for a coding agent like Claude Code or Cursor.

Rules:
- Never fabricate an endpoint, field, or behavior. If search_docs doesn't have the answer, say so explicitly instead of guessing.
- If you answer from your own general knowledge without calling a tool, say so plainly (e.g. "outside what's in these docs, ...") so the developer knows it wasn't verified against this platform's actual documentation.
- Clearly distinguish web_search results from search_docs results when you use both; they are not the same kind of source.
- Never use em dashes (—) anywhere in your answer; use a comma, period, semicolon, or parentheses instead.`;

// Each iteration is a full LLM round trip and can itself make several tool
// calls, so this bounds worst-case latency, not cost: every user brings
// their own API key, and the cap only engages on the rare query that
// genuinely needs many rounds. 12 gives real headroom for multi-tool
// questions (e.g. search_docs + web_search + a follow-up search) without
// letting a runaway loop run for minutes.
const MAX_ITERATIONS = 12;

const SearchDocsArgs = z.object({ query: z.string().min(1).describe("What to search for in this platform's crawled documentation") });
const WebSearchArgs = z.object({ query: z.string().min(1).describe("What to search for on the live web") });
const GenerateStarterCodeArgs = z.object({
  lang: z.enum(["ts", "py"]).describe("Target language"),
  workflow: z.string().optional().describe("A commonWorkflows name to target; omit for the first workflow"),
});
const AssembleHandoffArgs = z.object({
  lang: z.enum(["ts", "py"]).describe("Target language for the embedded starter script"),
  workflow: z.string().optional().describe("A commonWorkflows name to target; omit for the first workflow"),
});

function buildTools(hasSearchProvider: boolean): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: "search_docs",
      description: "Search this platform's own crawled documentation for relevant excerpts.",
      parameters: SearchDocsArgs,
    },
    {
      name: "generate_starter_code",
      description: "Generate a real, syntax-checked starter script from this run's blueprint. Returns an honest stub if the run's auth scheme isn't supported yet.",
      parameters: GenerateStarterCodeArgs,
    },
    {
      name: "assemble_handoff",
      description: "Assemble a paste-ready integration brief (task, auth, starter code, pitfalls) for a coding agent.",
      parameters: AssembleHandoffArgs,
    },
  ];
  if (hasSearchProvider) {
    tools.push({
      name: "web_search",
      description: "Search the live web for outside context not covered by this platform's own docs.",
      parameters: WebSearchArgs,
    });
  }
  return tools;
}

interface CodegenContext {
  understanding: Awaited<ReturnType<LocalFileStore["getUnderstanding"]>>;
  endpoints: Awaited<ReturnType<LocalFileStore["getEndpoints"]>>;
  platform: GenerateCodePlatform;
}

async function loadCodegenContext(store: LocalFileStore): Promise<CodegenContext> {
  const understanding = await store.getUnderstanding();
  const endpoints = await store.getEndpoints();
  const platformRecord = await store.getPlatform();
  return {
    understanding,
    endpoints,
    platform: {
      name: platformRecord.name,
      slug: store.slug,
      baseUrl: platformRecord.baseUrl,
      authScheme: parseAuthScheme(platformRecord.authScheme),
    },
  };
}

interface ToolContext {
  store: LocalFileStore;
  llm: LLMProvider;
  searchProvider: SearchProvider | undefined;
  platformId: string;
}

async function dispatchTool(call: ToolCallRequest, ctx: ToolContext): Promise<{ content: string; sources: ChatSource[] }> {
  switch (call.name) {
    case "search_docs": {
      const parsed = SearchDocsArgs.safeParse(call.input);
      if (!parsed.success) return { content: `Invalid arguments for search_docs: ${parsed.error.message}`, sources: [] };
      const [embedding] = await ctx.llm.embed([parsed.data.query]);
      const results = await ctx.store.hybridSearch(ctx.platformId, embedding!, parsed.data.query, 5);
      if (results.length === 0) {
        return { content: "No matching documentation found for that query.", sources: [] };
      }
      const sources: ChatSource[] = results.map((r) => ({
        type: "docs",
        ref: r.metadata.sourceUrl,
        title: r.metadata.sourceTitle,
        score: r.score,
      }));
      const content = results
        .map((r, i) => `[${i + 1}] (${r.metadata.sourceTitle}, score ${r.score.toFixed(2)}): ${r.content}`)
        .join("\n\n");
      return { content, sources };
    }
    case "web_search": {
      if (!ctx.searchProvider) return { content: "Web search is not configured for this instance.", sources: [] };
      const parsed = WebSearchArgs.safeParse(call.input);
      if (!parsed.success) return { content: `Invalid arguments for web_search: ${parsed.error.message}`, sources: [] };
      const results = await ctx.searchProvider.search(parsed.data.query, 5);
      if (results.length === 0) return { content: "No web results found.", sources: [] };
      const sources: ChatSource[] = results.map((r) => ({ type: "web", ref: r.url, title: r.title }));
      const content = results.map((r, i) => `[${i + 1}] ${r.title} (${r.url}): ${r.snippet}`).join("\n\n");
      return { content, sources };
    }
    case "generate_starter_code": {
      const parsed = GenerateStarterCodeArgs.safeParse(call.input);
      if (!parsed.success) return { content: `Invalid arguments for generate_starter_code: ${parsed.error.message}`, sources: [] };
      const { understanding, endpoints, platform } = await loadCodegenContext(ctx.store);
      if (!understanding) return { content: "No understanding generated yet for this run.", sources: [] };
      try {
        const options = parsed.data.workflow === undefined ? { lang: parsed.data.lang } : { lang: parsed.data.lang, workflow: parsed.data.workflow };
        const result = await generateCode(understanding, endpoints, platform, options);
        return { content: JSON.stringify(result), sources: [] };
      } catch (error) {
        if (error instanceof UnknownWorkflowError) return { content: error.message, sources: [] };
        throw error;
      }
    }
    case "assemble_handoff": {
      const parsed = AssembleHandoffArgs.safeParse(call.input);
      if (!parsed.success) return { content: `Invalid arguments for assemble_handoff: ${parsed.error.message}`, sources: [] };
      const { understanding, endpoints, platform } = await loadCodegenContext(ctx.store);
      if (!understanding) return { content: "No understanding generated yet for this run.", sources: [] };
      try {
        const options = parsed.data.workflow === undefined ? { lang: parsed.data.lang } : { lang: parsed.data.lang, workflow: parsed.data.workflow };
        const result = await assembleHandoff(understanding, endpoints, platform, options);
        return { content: result.markdown, sources: [] };
      } catch (error) {
        if (error instanceof UnknownWorkflowError) return { content: error.message, sources: [] };
        throw error;
      }
    }
    default:
      return { content: `Unknown tool "${call.name}".`, sources: [] };
  }
}

async function fallbackToSingleShot(
  store: LocalFileStore,
  llm: LLMProvider,
  platformId: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AgenticChatResult> {
  const result = await runChatAgent(store, llm, platformId, message, history);
  return {
    answer: result.answer,
    sources: result.citations.map((c) => ({ type: "docs", ref: c.sourceUrl, title: c.sourceTitle })),
  };
}

/**
 * Agentic chat: a real multi-turn tool-calling loop (search_docs, web_search,
 * generate_starter_code, assemble_handoff) instead of chat-agent.ts's
 * single-shot RAG. Every source in the result is tagged with where it
 * actually came from (docs excerpt with a real score, live web result with
 * a URL, or "model_knowledge" when the model answered without calling any
 * tool this turn), so the caller never has to guess what was actually
 * grounded. If the configured provider's tool-calling fails outright on the
 * very first turn (a provider that doesn't support it well), this degrades
 * to the old single-shot grounded RAG behavior rather than hard-failing the
 * whole chat.
 */
export async function runAgenticChatAgent(
  store: LocalFileStore,
  llm: LLMProvider,
  searchProvider: SearchProvider | undefined,
  platformId: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AgenticChatResult> {
  const tools = buildTools(searchProvider !== undefined);
  const ctx: ToolContext = { store, llm, searchProvider, platformId };

  const messages: ToolLoopMessage[] = [
    ...history.slice(-6).map((h): ToolLoopMessage =>
      h.role === "user" ? { role: "user", content: h.content } : { role: "assistant", content: h.content, toolCalls: [] },
    ),
    { role: "user", content: message },
  ];

  const sources = new Map<string, ChatSource>();
  let usedAnyTool = false;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let result;
    try {
      result = await llm.completeWithTools({ system: SYSTEM_PROMPT, messages, tools });
    } catch (error) {
      if (iteration === 0) {
        return fallbackToSingleShot(store, llm, platformId, message, history);
      }
      throw error;
    }

    if (result.toolCalls.length === 0) {
      const answer = stripEmDashes(result.text ?? "I wasn't able to produce an answer.");
      if (!usedAnyTool) {
        sources.set("model", { type: "model_knowledge", ref: "model" });
      }
      return { answer, sources: Array.from(sources.values()) };
    }

    usedAnyTool = true;
    messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

    for (const call of result.toolCalls) {
      const dispatched = await dispatchTool(call, ctx);
      for (const source of dispatched.sources) sources.set(source.ref, source);
      messages.push({ role: "tool_result", toolCallId: call.id, toolName: call.name, content: dispatched.content });
    }
  }

  return {
    answer:
      "I made several tool calls but couldn't settle on a final answer within the allotted steps. Try rephrasing or asking a narrower question.",
    sources: Array.from(sources.values()),
  };
}
