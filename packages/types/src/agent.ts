import { z } from "zod";

export const AgentName = z.enum([
  "coordinator",
  "import",
  "documentation",
  "understanding",
  "chat",
]);
export type AgentName = z.infer<typeof AgentName>;

export const AgentRunStatus = z.enum(["queued", "running", "succeeded", "failed"]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const AgentRun = z.object({
  id: z.string().uuid(),
  platformId: z.string().uuid(),
  agent: AgentName,
  status: AgentRunStatus,
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).nullable(),
  error: z.string().nullable(),
  attempt: z.number().int().min(1),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
});
export type AgentRun = z.infer<typeof AgentRun>;
