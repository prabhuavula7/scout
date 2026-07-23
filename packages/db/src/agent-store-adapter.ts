import { eq, desc } from "drizzle-orm";
import type {
  AgentName,
  Endpoint,
  PlatformStatus,
  PlatformUnderstanding,
} from "@scout/types";
import type { AgentStore, DocChunkInput, HybridSearchResult, ImportResultFields } from "@scout/store";
import type { Database } from "./client.js";
import * as schema from "./schema.js";
import { hybridSearch } from "./vector-search.js";

/**
 * Adapts the Postgres/Drizzle schema to the AgentStore contract so the
 * pipeline agents (packages/agents) can run unchanged against the dormant
 * hosted mode (apps/api + apps/workers), which still needs a real
 * multi-tenant database. The CLI's default path uses
 * `LocalFileStore` from @scout/store instead.
 */
export class DrizzleAgentStore implements AgentStore {
  constructor(private readonly db: Database) {}

  async startAgentRun(params: {
    platformId: string;
    agent: AgentName;
    input: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const [run] = await this.db
      .insert(schema.agentRuns)
      .values({ platformId: params.platformId, agent: params.agent, status: "running", input: params.input, startedAt: new Date() })
      .returning();
    return { id: run!.id };
  }

  async completeAgentRun(id: string, output: Record<string, unknown>): Promise<void> {
    await this.db
      .update(schema.agentRuns)
      .set({ status: "succeeded", output, finishedAt: new Date() })
      .where(eq(schema.agentRuns.id, id));
  }

  async failAgentRun(id: string, error: string): Promise<void> {
    await this.db
      .update(schema.agentRuns)
      .set({ status: "failed", error, finishedAt: new Date() })
      .where(eq(schema.agentRuns.id, id));
  }

  async setPlatformStatus(platformId: string, status: PlatformStatus): Promise<void> {
    await this.db
      .update(schema.platforms)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.platforms.id, platformId));
  }

  async applyImportResult(platformId: string, fields: ImportResultFields): Promise<void> {
    await this.db
      .update(schema.platforms)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(schema.platforms.id, platformId));
  }

  async insertEndpoints(platformId: string, endpoints: Array<Omit<Endpoint, "id" | "platformId">>): Promise<void> {
    if (endpoints.length === 0) return;
    await this.db.insert(schema.endpoints).values(endpoints.map((e) => ({ ...e, platformId })));
  }

  async insertDocChunks(platformId: string, chunks: DocChunkInput[]): Promise<number> {
    if (chunks.length === 0) return 0;
    await this.db.insert(schema.docChunks).values(
      chunks.map((c) => ({
        platformId,
        content: c.content,
        metadata: c.metadata,
        tokenCount: c.tokenCount,
        embedding: c.embedding,
      })),
    );
    return chunks.length;
  }

  async getRecentDocChunks(platformId: string, limit: number): Promise<Array<{ id: string; content: string }>> {
    const rows = await this.db
      .select({ id: schema.docChunks.id, content: schema.docChunks.content })
      .from(schema.docChunks)
      .where(eq(schema.docChunks.platformId, platformId))
      .orderBy(desc(schema.docChunks.createdAt))
      .limit(limit);
    return rows;
  }

  async hybridSearch(
    platformId: string,
    queryEmbedding: number[],
    queryText: string,
    limit: number,
  ): Promise<HybridSearchResult[]> {
    return hybridSearch(this.db, platformId, queryEmbedding, queryText, limit);
  }

  async upsertUnderstanding(platformId: string, data: PlatformUnderstanding): Promise<void> {
    await this.db
      .insert(schema.platformUnderstanding)
      .values({ platformId, data })
      .onConflictDoUpdate({
        target: schema.platformUnderstanding.platformId,
        set: { data, generatedAt: new Date() },
      });
  }
}
