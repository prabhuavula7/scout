import type { LLMProvider } from "@scout/ai";
import { stripEmDashes } from "./base.js";

export interface ThreadMessageForSummary {
  role: "user" | "assistant";
  content: string;
}

const SUMMARY_SYSTEM_PROMPT = `You are distilling a chat thread between a developer and an AI assistant into a short handoff note for a DIFFERENT coding agent that will pick up the integration work. Extract only what was actually confirmed or discovered in the conversation below: specific endpoints discussed, auth details confirmed, decisions made, workarounds found, and any pitfalls or gotchas surfaced. Do not restate generic platform information that would already be covered elsewhere in a handoff brief. Do not fabricate anything that isn't actually present in the conversation. If the conversation didn't surface anything substantive beyond generic Q&A, say so plainly in one line instead of padding. Write 3-8 bullet points (fewer if that's all there is), no preamble, no closing remarks. Never use em dashes (—); use a comma, period, semicolon, or parentheses instead.`;

/**
 * Distills a thread's conversation into a short "already figured out" note
 * for a handoff brief, so a coding agent picking up the task doesn't have to
 * re-derive what a developer already worked through in chat. One extra LLM
 * call (single-shot, not the agentic tool-calling loop) over the raw
 * transcript; returns "" for an empty thread so callers can skip the
 * section entirely rather than showing an empty one.
 */
export async function summarizeThreadForHandoff(
  llm: LLMProvider,
  messages: ThreadMessageForSummary[],
): Promise<string> {
  if (messages.length === 0) return "";

  const transcript = messages
    .map((m) => `${m.role === "user" ? "Developer" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const result = await llm.complete({
    system: SUMMARY_SYSTEM_PROMPT,
    prompt: `Conversation:\n\n${transcript}`,
  });

  return stripEmDashes(result.trim());
}
