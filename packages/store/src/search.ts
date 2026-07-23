import MiniSearch from "minisearch";
import type { DocChunkMetadata } from "@scout/types";
import type { HybridSearchResult } from "./interface.js";

export interface StoredChunk {
  id: string;
  platformId: string;
  content: string;
  metadata: DocChunkMetadata;
  tokenCount: number;
  embedding: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Local equivalent of the Postgres hybrid-search blend (packages/db's
 * `hybridSearch`, used by the dormant hosted mode): 70% embedding cosine
 * similarity, 30% keyword relevance, so exact-term matches still surface
 * even when the embedding neighborhood is noisy. No native dependencies,
 * scales fine at CLI/single-platform chunk counts (hundreds to low
 * thousands); swap in something like sqlite-vec later if that stops being true.
 */
export function localHybridSearch(
  chunks: StoredChunk[],
  queryEmbedding: number[],
  queryText: string,
  limit: number,
): HybridSearchResult[] {
  if (chunks.length === 0) return [];

  const vectorRanked = chunks
    .map((chunk) => ({ chunk, vectorScore: cosineSimilarity(chunk.embedding, queryEmbedding) }))
    .sort((a, b) => b.vectorScore - a.vectorScore)
    .slice(0, 50);

  const miniSearch = new MiniSearch<{ id: string; content: string }>({
    fields: ["content"],
    storeFields: ["content"],
  });
  miniSearch.addAll(chunks.map((c) => ({ id: c.id, content: c.content })));

  const textResults = miniSearch.search(queryText, { prefix: true, fuzzy: 0.2 });
  const maxTextScore = textResults.length > 0 ? Math.max(...textResults.map((r) => r.score)) : 0;
  const textScoreById = new Map(
    textResults.map((r) => [r.id as string, maxTextScore > 0 ? r.score / maxTextScore : 0]),
  );

  return vectorRanked
    .map(({ chunk, vectorScore }) => {
      const textScore = textScoreById.get(chunk.id) ?? 0;
      return {
        id: chunk.id,
        platformId: chunk.platformId,
        content: chunk.content,
        metadata: chunk.metadata,
        tokenCount: chunk.tokenCount,
        score: vectorScore * 0.7 + textScore * 0.3,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
