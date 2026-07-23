import { eq } from "drizzle-orm";
import type { Database } from "@integration-scout/db";
import { schema } from "@integration-scout/db";
import type { AgentName } from "@integration-scout/types";

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
}

const DEFAULT_RETRY: RetryOptions = { retries: 2, baseDelayMs: 500 };

/**
 * Exponential-backoff retry. Agents call untrusted external services
 * (docs sites, LLM APIs) that fail transiently far more often than local
 * code, so every agent step goes through this instead of a bare call.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const { retries, baseDelayMs } = { ...DEFAULT_RETRY, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt <= retries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Recursively replaces em dashes in every string value of a JSON-like
 * structure. LLM prompt instructions aren't 100% reliable, so agent output
 * that's shown to users (understanding blueprints, chat answers) goes
 * through this rather than trusting the prompt alone to keep them out.
 */
export function stripEmDashes<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\s*—\s*/g, ", ").replace(/—/g, ",") as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripEmDashes(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, stripEmDashes(val)]),
    ) as T;
  }
  return value;
}

/**
 * Wraps an agent's execution in an `agent_runs` row so every step of the
 * pipeline is inspectable after the fact (goal/input/output/error/attempt),
 * satisfying the "agents have memory + validation" requirement without
 * needing a separate observability stack.
 */
export async function runAgent<TOutput>(
  db: Database,
  platformId: string,
  agent: AgentName,
  input: Record<string, unknown>,
  fn: () => Promise<TOutput>,
): Promise<TOutput> {
  const [run] = await db
    .insert(schema.agentRuns)
    .values({ platformId, agent, status: "running", input, startedAt: new Date() })
    .returning();

  try {
    const output = await fn();
    await db
      .update(schema.agentRuns)
      .set({
        status: "succeeded",
        output: output as Record<string, unknown>,
        finishedAt: new Date(),
      })
      .where(eq(schema.agentRuns.id, run!.id));
    return output;
  } catch (error) {
    await db
      .update(schema.agentRuns)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      })
      .where(eq(schema.agentRuns.id, run!.id));
    throw error;
  }
}
