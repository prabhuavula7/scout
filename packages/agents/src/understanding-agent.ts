import type { LLMProvider } from "@scout/ai";
import type { AgentStore } from "@scout/store";
import { PlatformUnderstanding } from "@scout/types";
import { stripEmDashes } from "./base.js";

const UnderstandingDraft = PlatformUnderstanding.omit({
  platformId: true,
  generatedAt: true,
  citations: true,
});

const SYSTEM_PROMPT = `You are a Staff Solutions Architect analyzing an unfamiliar enterprise API.
You are given the platform's OpenAPI endpoint summary and a sample of its crawled
documentation. Produce a rigorous, accurate integration blueprint. Never invent
endpoints, fields, or auth mechanisms that are not evidenced in the provided
material. If something is unclear, say so in "missingDocumentation" instead
of guessing. Mermaid diagrams must use valid Mermaid syntax. Never use em dashes
(—) anywhere in your output; use a comma, period, semicolon, or parentheses instead.`;

export interface UnderstandingContext {
  platformName: string;
  endpointSummaries: string[];
  docExcerpts: string[];
}

/**
 * Understanding Agent: synthesizes the platform summary, architecture
 * overview, auth flow, data model, workflows, pitfalls, and diagrams from
 * whatever was actually imported/crawled. Grounded in real endpoint and doc
 * data passed in `context`, not hallucinated from the model's own priors.
 */
export async function runUnderstandingAgent(
  store: AgentStore,
  llm: LLMProvider,
  platformId: string,
  context: UnderstandingContext,
): Promise<void> {
  const prompt = `Platform: ${context.platformName}

## Endpoints (${context.endpointSummaries.length})
${context.endpointSummaries.slice(0, 150).join("\n")}

## Documentation excerpts
${context.docExcerpts.slice(0, 40).join("\n\n---\n\n")}

Generate the full integration blueprint now.`;

  const draft = await llm.completeStructured({
    system: SYSTEM_PROMPT,
    prompt,
    schema: UnderstandingDraft,
    schemaName: "platform_understanding",
  });

  const citationChunks = await store.getRecentDocChunks(platformId, 20);

  const result = PlatformUnderstanding.parse({
    ...stripEmDashes(draft),
    platformId,
    citations: citationChunks.map((c) => c.id),
    generatedAt: new Date().toISOString(),
  });

  await store.upsertUnderstanding(platformId, result);
}
