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
 * platformSlug/platformName are set on "docs" sources so a thread spanning
 * more than one platform can show which one a citation actually came from.
 */
export interface ChatSource {
  type: "docs" | "web" | "model_knowledge";
  ref: string;
  title?: string;
  score?: number;
  platformSlug?: string;
  platformName?: string;
}

export interface AgenticChatResult {
  answer: string;
  sources: ChatSource[];
}

/** One platform in scope for a conversation. A single-run thread's chat
 * passes exactly one of these; a multi-run thread passes several, and
 * search_docs merges/re-ranks results across all of them instead of
 * querying just one store. */
export interface ChatPlatform {
  platformId: string;
  slug: string;
  name: string;
  store: LocalFileStore;
}

const BASE_SYSTEM_PROMPT = `You are Scout's integration assistant for a platform a developer has already imported. You have tools:
- search_docs: search this platform's own crawled documentation. Prefer this before answering any factual question about the platform.
- web_search: search the live web for outside context (only available if configured). Results from this are NOT the platform's own docs -- treat them as supplementary, not authoritative.
- generate_starter_code: generate a real, syntax-checked starter script (auth handshake + one read call) from this run's blueprint.
- assemble_handoff: assemble a paste-ready integration brief (task, auth, starter code, pitfalls) for a coding agent like Claude Code or Cursor.

Rules:
- Never fabricate an endpoint, field, or behavior. If search_docs doesn't have the answer, say so explicitly instead of guessing.
- If you answer from your own general knowledge without calling a tool, say so plainly (e.g. "outside what's in these docs, ...") so the developer knows it wasn't verified against this platform's actual documentation.
- Clearly distinguish web_search results from search_docs results when you use both; they are not the same kind of source.
- Never use em dashes (—) anywhere in your answer; use a comma, period, semicolon, or parentheses instead.`;

function buildSystemPrompt(platforms: ChatPlatform[]): string {
  if (platforms.length === 1) return BASE_SYSTEM_PROMPT;
  const list = platforms.map((p) => `${p.name} (slug: ${p.slug})`).join(", ");
  return `${BASE_SYSTEM_PROMPT}

This conversation spans multiple platforms: ${list}. search_docs automatically searches all of them and tags each result with which platform it came from. generate_starter_code and assemble_handoff each target exactly one platform per call: pass "platform" set to that platform's slug. If you call either without "platform", you'll get an error listing the valid slugs.`;
}

// Each iteration is a full LLM round trip and can itself make several tool
// calls, so this bounds worst-case latency, not cost: every user brings
// their own API key, and the cap only engages on the rare query that
// genuinely needs many tool-calling rounds. 12 gives real headroom for
// multi-tool questions (e.g. search_docs + web_search + a follow-up search)
// without letting a runaway loop run for minutes.
const MAX_ITERATIONS = 12;

const SearchDocsArgs = z.object({ query: z.string().min(1).describe("What to search for in this platform's crawled documentation") });
const WebSearchArgs = z.object({ query: z.string().min(1).describe("What to search for on the live web") });
const GenerateStarterCodeArgs = z.object({
  lang: z.enum(["ts", "py"]).describe("Target language"),
  workflow: z.string().optional().describe("A commonWorkflows name to target; omit for the first workflow"),
  platform: z.string().optional().describe("Required only when this conversation spans multiple platforms: the target platform's slug"),
});
const AssembleHandoffArgs = z.object({
  lang: z.enum(["ts", "py"]).describe("Target language for the embedded starter script"),
  workflow: z.string().optional().describe("A commonWorkflows name to target; omit for the first workflow"),
  platform: z.string().optional().describe("Required only when this conversation spans multiple platforms: the target platform's slug"),
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
  platforms: ChatPlatform[];
  llm: LLMProvider;
  searchProvider: SearchProvider | undefined;
}

/** Picks which platform a single-target tool call (generate_starter_code,
 * assemble_handoff) applies to. With exactly one platform in scope there's
 * nothing to disambiguate; with several, the model must pass a matching
 * slug or get a clear error listing the valid ones, rather than the tool
 * silently guessing which platform "the run" refers to. */
function resolveTargetPlatform(ctx: ToolContext, requestedSlug: string | undefined): ChatPlatform | { error: string } {
  if (ctx.platforms.length === 1) return ctx.platforms[0]!;
  const slugs = ctx.platforms.map((p) => p.slug).join(", ");
  if (!requestedSlug) {
    return { error: `This conversation spans multiple platforms (${slugs}). Pass "platform" set to one of these slugs.` };
  }
  const match = ctx.platforms.find((p) => p.slug === requestedSlug);
  if (!match) return { error: `Unknown platform "${requestedSlug}". This conversation spans: ${slugs}.` };
  return match;
}

async function dispatchTool(call: ToolCallRequest, ctx: ToolContext): Promise<{ content: string; sources: ChatSource[] }> {
  switch (call.name) {
    case "search_docs": {
      const parsed = SearchDocsArgs.safeParse(call.input);
      if (!parsed.success) return { content: `Invalid arguments for search_docs: ${parsed.error.message}`, sources: [] };
      const [embedding] = await ctx.llm.embed([parsed.data.query]);
      const perPlatformLimit = ctx.platforms.length > 1 ? 4 : 5;
      const overallLimit = ctx.platforms.length > 1 ? 8 : 5;

      const perPlatform = await Promise.all(
        ctx.platforms.map(async (p) => {
          const results = await p.store.hybridSearch(p.platformId, embedding!, parsed.data.query, perPlatformLimit);
          return results.map((r) => ({ result: r, platform: p }));
        }),
      );
      const merged = perPlatform
        .flat()
        .sort((a, b) => b.result.score - a.result.score)
        .slice(0, overallLimit);

      if (merged.length === 0) {
        return { content: "No matching documentation found for that query.", sources: [] };
      }
      const sources: ChatSource[] = merged.map(({ result, platform }) => ({
        type: "docs",
        ref: result.metadata.sourceUrl,
        title: result.metadata.sourceTitle,
        score: result.score,
        platformSlug: platform.slug,
        platformName: platform.name,
      }));
      const content = merged
        .map(
          ({ result, platform }, i) =>
            `[${i + 1}] (${platform.name} -- ${result.metadata.sourceTitle}, score ${result.score.toFixed(2)}): ${result.content}`,
        )
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
      const target = resolveTargetPlatform(ctx, parsed.data.platform);
      if ("error" in target) return { content: target.error, sources: [] };
      const { understanding, endpoints, platform } = await loadCodegenContext(target.store);
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
      const target = resolveTargetPlatform(ctx, parsed.data.platform);
      if ("error" in target) return { content: target.error, sources: [] };
      const { understanding, endpoints, platform } = await loadCodegenContext(target.store);
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

/** The single-shot grounded RAG fallback only ever supported one store, and
 * a multi-run thread's chat is inherently tool-based (search_docs merging
 * several stores) rather than something a single-shot prompt can express
 * cleanly. Deliberately scoped to the first platform rather than extended
 * to merge context from all of them: this path only engages when a
 * configured provider's tool-calling fails outright, an already-rare edge
 * case, so a slightly narrower (but still real, cited) answer beats adding
 * complexity to a fallback that's meant to be simple by design. */
async function fallbackToSingleShot(
  platforms: ChatPlatform[],
  llm: LLMProvider,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AgenticChatResult> {
  const primary = platforms[0]!;
  const result = await runChatAgent(primary.store, llm, primary.platformId, message, history);
  return {
    answer: result.answer,
    sources: result.citations.map((c) => ({
      type: "docs",
      ref: c.sourceUrl,
      title: c.sourceTitle,
      platformSlug: primary.slug,
      platformName: primary.name,
    })),
  };
}

/**
 * Agentic chat: a real multi-turn tool-calling loop (search_docs, web_search,
 * generate_starter_code, assemble_handoff) instead of chat-agent.ts's
 * single-shot RAG. Every source in the result is tagged with where it
 * actually came from (docs excerpt with a real score, live web result with
 * a URL, or "model_knowledge" when the model answered without calling any
 * tool this turn), so the caller never has to guess what was actually
 * grounded. Takes one or more platforms in scope: a single-run thread
 * passes exactly one, a multi-run thread passes several and search_docs
 * merges/re-ranks results across all of them, tagging each with which
 * platform it came from. If the configured provider's tool-calling fails
 * outright on the very first turn (a provider that doesn't support it
 * well), this degrades to the old single-shot grounded RAG behavior rather
 * than hard-failing the whole chat.
 */
export async function runAgenticChatAgent(
  platforms: ChatPlatform[],
  llm: LLMProvider,
  searchProvider: SearchProvider | undefined,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<AgenticChatResult> {
  const tools = buildTools(searchProvider !== undefined);
  const ctx: ToolContext = { platforms, llm, searchProvider };

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
      result = await llm.completeWithTools({ system: buildSystemPrompt(platforms), messages, tools });
    } catch (error) {
      if (iteration === 0) {
        return fallbackToSingleShot(platforms, llm, message, history);
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
