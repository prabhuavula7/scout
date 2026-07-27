import { z } from "zod";

export const DocChunkMetadata = z.object({
  sourceUrl: z.string().url(),
  sourceTitle: z.string(),
  section: z.string().nullable(),
  topic: z.enum([
    "authentication",
    "rate_limits",
    "pagination",
    "webhooks",
    "objects",
    "resources",
    "endpoints",
    "errors",
    "sdks",
    "versioning",
    "best_practices",
    "general",
  ]),
  /** How this chunk entered the corpus: crawled from the platform's --docs
   * URLs, a file the user uploaded, or a link the user attached directly.
   * Optional and absent on chunks stored before this field existed. */
  origin: z.enum(["crawl", "upload", "link"]).optional(),
});
export type DocChunkMetadata = z.infer<typeof DocChunkMetadata>;

export const DocChunk = z.object({
  id: z.string().uuid(),
  platformId: z.string().uuid(),
  content: z.string(),
  metadata: DocChunkMetadata,
  tokenCount: z.number().int().positive(),
});
export type DocChunk = z.infer<typeof DocChunk>;

export const RetrievedChunk = DocChunk.extend({
  score: z.number(),
});
export type RetrievedChunk = z.infer<typeof RetrievedChunk>;

export const Citation = z.object({
  chunkId: z.string().uuid(),
  sourceUrl: z.string().url(),
  sourceTitle: z.string(),
  quote: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const ChatRole = z.enum(["user", "assistant"]);
export type ChatRole = z.infer<typeof ChatRole>;

export const ChatMessage = z.object({
  id: z.string().uuid(),
  platformId: z.string().uuid(),
  role: ChatRole,
  content: z.string(),
  citations: z.array(Citation),
  createdAt: z.string().datetime(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const ChatRequest = z.object({
  platformId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  history: z
    .array(z.object({ role: ChatRole, content: z.string() }))
    .max(20)
    .default([]),
});
export type ChatRequest = z.infer<typeof ChatRequest>;
