import type { Database } from "@integration-scout/db";
import { schema } from "@integration-scout/db";
import type { LLMProvider } from "@integration-scout/ai";
import type { Chunk } from "./chunk.js";

const EMBEDDING_BATCH_SIZE = 96;

/**
 * Embeds chunks in batches and persists them. Batching keeps us under
 * OpenAI's per-request input limits and reduces round trips for large docs.
 */
export async function embedAndStoreChunks(
  db: Database,
  llm: LLMProvider,
  platformId: string,
  chunks: Chunk[],
): Promise<number> {
  let stored = 0;

  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const embeddings = await llm.embed(batch.map((c) => c.content));

    await db.insert(schema.docChunks).values(
      batch.map((chunk, j) => ({
        platformId,
        content: chunk.content,
        metadata: chunk.metadata,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[j]!,
      })),
    );

    stored += batch.length;
  }

  return stored;
}
