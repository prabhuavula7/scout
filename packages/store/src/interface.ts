import type {
  AgentName,
  AuthScheme,
  DocChunkMetadata,
  Endpoint,
  PlatformStatus,
  PlatformUnderstanding,
} from "@scout/types";

export interface HybridSearchResult {
  id: string;
  platformId: string;
  content: string;
  metadata: DocChunkMetadata;
  tokenCount: number;
  score: number;
}

export interface DocChunkInput {
  content: string;
  metadata: DocChunkMetadata;
  tokenCount: number;
  embedding: number[];
}

export interface ImportResultFields {
  name: string;
  baseUrl: string | null;
  authScheme: AuthScheme | null;
  rawSpec: Record<string, unknown> | null;
}

/**
 * The persistence contract every pipeline agent (coordinator, documentation,
 * understanding, chat) depends on instead of a concrete database. The CLI's
 * default implementation is `LocalFileStore` (this package); the dormant
 * hosted mode in apps/api implements the same contract over Postgres in
 * packages/db, so the agent code itself never needs to know which one it's
 * talking to.
 */
export interface AgentStore {
  startAgentRun(params: {
    platformId: string;
    agent: AgentName;
    input: Record<string, unknown>;
  }): Promise<{ id: string }>;
  completeAgentRun(id: string, output: Record<string, unknown>): Promise<void>;
  failAgentRun(id: string, error: string): Promise<void>;

  setPlatformStatus(platformId: string, status: PlatformStatus): Promise<void>;
  applyImportResult(platformId: string, fields: ImportResultFields): Promise<void>;
  insertEndpoints(platformId: string, endpoints: Array<Omit<Endpoint, "id" | "platformId">>): Promise<void>;

  insertDocChunks(platformId: string, chunks: DocChunkInput[]): Promise<number>;
  getRecentDocChunks(platformId: string, limit: number): Promise<Array<{ id: string; content: string }>>;
  hybridSearch(
    platformId: string,
    queryEmbedding: number[],
    queryText: string,
    limit: number,
  ): Promise<HybridSearchResult[]>;

  upsertUnderstanding(platformId: string, data: PlatformUnderstanding): Promise<void>;
}
