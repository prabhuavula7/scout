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
  /** Records (or clears, with null) a warning about the doc crawl, e.g. one
   * or more pages coming back with suspiciously little extractable content
   * (commonly a JS-rendered page cheerio's static fetch can't execute).
   * Optional: the dormant hosted-mode store (DrizzleAgentStore) doesn't
   * implement this yet, and callers should treat its absence as "no
   * warning support" rather than a hard requirement. */
  setDocsCrawlWarning?(platformId: string, warning: string | null): Promise<void>;
  /** Same idea as setDocsCrawlWarning, for the understanding-synthesis step
   * itself hitting its endpoint/doc-chunk scope caps (see
   * MAX_ENDPOINT_SUMMARIES / MAX_DOC_EXCERPTS in understanding-agent.ts).
   * Optional for the same reason. */
  setUnderstandingScopeWarning?(platformId: string, warning: string | null): Promise<void>;
  insertEndpoints(platformId: string, endpoints: Array<Omit<Endpoint, "id" | "platformId">>): Promise<void>;

  insertDocChunks(platformId: string, chunks: DocChunkInput[]): Promise<number>;
  getRecentDocChunks(platformId: string, limit: number): Promise<Array<{ id: string; content: string }>>;
  /** Same idea as getRecentDocChunks, but instead of biasing toward whatever
   * was crawled last (an artifact of crawl order, not relevance), spreads
   * the selection evenly across every source page so understanding
   * synthesis doesn't end up built from just the last 2-3 pages crawled on
   * a large, many-page doc site. Optional: falls back to getRecentDocChunks
   * where unimplemented (the dormant hosted-mode store). */
  getRepresentativeDocChunks?(
    platformId: string,
    limit: number,
  ): Promise<{ chunks: Array<{ id: string; content: string }>; totalAvailable: number }>;
  hybridSearch(
    platformId: string,
    queryEmbedding: number[],
    queryText: string,
    limit: number,
  ): Promise<HybridSearchResult[]>;

  /** Every distinct source (crawled page, uploaded file, or attached link)
   * behind this run's doc chunks, one row per sourceUrl regardless of how
   * many chunks it produced. Powers the "attached documents" list in the
   * web UI and CLI so a user can see and remove what they added. Optional:
   * the dormant hosted-mode store doesn't implement this yet. */
  listDocSources?(
    platformId: string,
  ): Promise<Array<{ sourceUrl: string; sourceTitle: string; chunkCount: number; origin?: DocChunkMetadata["origin"] }>>;
  /** Removes every chunk whose metadata.sourceUrl matches, e.g. undoing an
   * upload or attached link added by mistake. Returns the number removed.
   * Optional for the same reason as listDocSources. */
  deleteDocChunksBySource?(platformId: string, sourceUrl: string): Promise<number>;

  upsertUnderstanding(platformId: string, data: PlatformUnderstanding): Promise<void>;
}
