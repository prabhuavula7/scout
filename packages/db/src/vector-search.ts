import { sql } from "drizzle-orm";
import type { HybridSearchResult } from "@scout/store";
import type { Database } from "./client.js";

export type { HybridSearchResult };

/**
 * Hybrid retrieval: blends pgvector cosine similarity with Postgres full-text
 * search (websearch_to_tsquery) so exact keyword matches (e.g. "webhook
 * signature") surface even when the embedding neighborhood is noisy.
 */
export async function hybridSearch(
  db: Database,
  platformId: string,
  queryEmbedding: number[],
  queryText: string,
  limit = 8,
): Promise<HybridSearchResult[]> {
  const vectorLiteral = `[${queryEmbedding.join(",")}]`;

  const rows = await db.execute<{
    id: string;
    platform_id: string;
    content: string;
    metadata: HybridSearchResult["metadata"];
    token_count: number;
    vector_score: number;
    text_score: number;
  }>(sql`
    with vector_ranked as (
      select
        id, platform_id, content, metadata, token_count,
        1 - (embedding <=> ${vectorLiteral}::vector) as vector_score
      from doc_chunks
      where platform_id = ${platformId}
      order by embedding <=> ${vectorLiteral}::vector
      limit 50
    ),
    text_ranked as (
      select
        id,
        ts_rank_cd(to_tsvector('english', content), websearch_to_tsquery('english', ${queryText})) as text_score
      from doc_chunks
      where platform_id = ${platformId}
        and to_tsvector('english', content) @@ websearch_to_tsquery('english', ${queryText})
    )
    select
      v.id, v.platform_id, v.content, v.metadata, v.token_count,
      v.vector_score,
      coalesce(t.text_score, 0) as text_score
    from vector_ranked v
    left join text_ranked t on t.id = v.id
    order by (v.vector_score * 0.7 + coalesce(t.text_score, 0) * 0.3) desc
    limit ${limit}
  `);

  return rows.rows.map((row) => ({
    id: row.id,
    platformId: row.platform_id,
    content: row.content,
    metadata: row.metadata,
    tokenCount: row.token_count,
    score: row.vector_score * 0.7 + row.text_score * 0.3,
  }));
}
