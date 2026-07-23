import type { LLMProvider } from "@scout/ai";
import type { AgentStore } from "@scout/store";
import { buildContextAndCitations } from "@scout/rag";
import type { Citation } from "@scout/types";
import { stripEmDashes } from "./base.js";

const SYSTEM_PROMPT = `You are Scout's documentation assistant. Answer ONLY using the
numbered source excerpts provided in the context. Every claim must be
traceable to a source. Cite sources inline using their bracket number, e.g.
"Webhooks are signed with HMAC-SHA256 [2]." If the context does not contain
the answer, say so explicitly instead of guessing. Never fabricate an
endpoint, field, or behavior that isn't in the provided excerpts. Never use
em dashes (—) anywhere in your answer; use a comma, period, semicolon, or
parentheses instead.`;

export interface ChatAgentResult {
  answer: string;
  citations: Citation[];
}

/**
 * Chat Agent: retrieval-augmented Q&A grounded on the platform's crawled
 * documentation. Never calls the LLM without first retrieving context, and
 * the citations returned always reference chunks that were actually
 * included in the prompt.
 */
export async function runChatAgent(
  store: AgentStore,
  llm: LLMProvider,
  platformId: string,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ChatAgentResult> {
  const [queryEmbedding] = await llm.embed([message]);
  const results = await store.hybridSearch(platformId, queryEmbedding!, message, 8);

  if (results.length === 0) {
    return {
      answer:
        "I don't have any indexed documentation for this platform yet, so I can't answer that. Try importing docs first.",
      citations: [],
    };
  }

  const { contextBlock, citations } = buildContextAndCitations(results);

  const historyBlock = history
    .slice(-6)
    .map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
    .join("\n");

  const prompt = `${historyBlock ? `## Recent conversation\n${historyBlock}\n\n` : ""}## Source excerpts\n${contextBlock}\n\n## Question\n${message}`;

  const answer = await llm.complete({ system: SYSTEM_PROMPT, prompt });

  return { answer: stripEmDashes(answer), citations };
}
