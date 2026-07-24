import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AgentName,
  AgentRunStatus,
  ChatRole,
  DocChunkMetadata,
  Endpoint,
  PlatformStatus,
  PlatformUnderstanding,
  Resource,
} from "@scout/types";
import type { AgentStore, DocChunkInput, HybridSearchResult, ImportResultFields } from "./interface.js";
import { localHybridSearch, type StoredChunk } from "./search.js";
import { historyDir, runDir, runsRoot, slugify } from "./paths.js";

export interface PlatformRecord {
  id: string;
  slug: string;
  connectorSlug: string;
  name: string;
  baseUrl: string | null;
  docsUrl: string | null;
  authScheme: string | null;
  status: PlatformStatus;
  rawSpec: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  history: Array<{ timestamp: string; trigger: string; summary: string }>;
  docUrls?: string[];
  lastDocsHash?: Record<string, string>;
  docsCrawlWarning?: string | null;
  understandingScopeWarning?: string | null;
  /** The docsDepth/docsMaxPages this run was created (or last recrawled)
   * with, so `scout watch` and refresh/recrawl reuse the user's actual
   * settings instead of falling back to hardcoded defaults. */
  crawlOptions?: { maxDepth: number; maxPages: number };
}

export interface ChatMessageRecord {
  id: string;
  role: ChatRole;
  content: string;
  citations: unknown[];
  createdAt: string;
}

export interface AgentRunRecord {
  id: string;
  platformId: string;
  agent: AgentName;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf-8");
}

/**
 * Default AgentStore implementation for the CLI: one directory per platform
 * run under ~/.scout/runs/<slug>/, no database or server required. Bound to
 * a single run for its lifetime; `create`/`open` handle picking that run.
 */
export class LocalFileStore implements AgentStore {
  private constructor(
    public readonly slug: string,
    public readonly dir: string,
  ) {}

  static async create(label: string, connectorSlug: string): Promise<{ store: LocalFileStore; platformId: string }> {
    const slug = await LocalFileStore.uniqueSlug(slugify(label));
    const dir = runDir(slug);
    const platformId = randomUUID();
    const now = new Date().toISOString();

    const record: PlatformRecord = {
      id: platformId,
      slug,
      connectorSlug,
      name: label,
      baseUrl: null,
      docsUrl: null,
      authScheme: null,
      status: "pending",
      rawSpec: null,
      createdAt: now,
      updatedAt: now,
      history: [],
    };
    await writeJson(path.join(dir, "platform.json"), record);
    return { store: new LocalFileStore(slug, dir), platformId };
  }

  static async open(slug: string): Promise<{ store: LocalFileStore; platformId: string } | null> {
    const dir = runDir(slug);
    const record = await readJson<PlatformRecord | null>(path.join(dir, "platform.json"), null);
    if (!record) return null;
    return { store: new LocalFileStore(slug, dir), platformId: record.id };
  }

  static async list(): Promise<PlatformRecord[]> {
    const root = runsRoot();
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const records: PlatformRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = await readJson<PlatformRecord | null>(path.join(root, entry.name, "platform.json"), null);
      if (record) records.push(record);
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  /** Deletes a run's entire directory (understanding, chunks, chat history,
   * history/ snapshots). Irreversible; returns false if the slug didn't exist
   * rather than throwing, so callers can distinguish "already gone" from a
   * real failure. */
  static async remove(slug: string): Promise<boolean> {
    const dir = runDir(slug);
    if (!(await LocalFileStore.exists(dir))) return false;
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  }

  private static async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let n = 2;
    while (await LocalFileStore.exists(runDir(candidate))) {
      candidate = `${base}-${n}`;
      n += 1;
    }
    return candidate;
  }

  private static async exists(p: string): Promise<boolean> {
    return fs
      .access(p)
      .then(() => true)
      .catch(() => false);
  }

  async getPlatform(): Promise<PlatformRecord> {
    const record = await readJson<PlatformRecord | null>(path.join(this.dir, "platform.json"), null);
    if (!record) throw new Error(`No platform record found for run "${this.slug}"`);
    return record;
  }

  private async updatePlatform(patch: Partial<PlatformRecord>): Promise<void> {
    const current = await this.getPlatform();
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await writeJson(path.join(this.dir, "platform.json"), next);
  }

  async setPlatformStatus(_platformId: string, status: PlatformStatus): Promise<void> {
    await this.updatePlatform({ status });
  }

  async applyImportResult(_platformId: string, fields: ImportResultFields): Promise<void> {
    await this.updatePlatform(fields);
  }

  async setDocsCrawlWarning(_platformId: string, warning: string | null): Promise<void> {
    await this.updatePlatform({ docsCrawlWarning: warning });
  }

  async setUnderstandingScopeWarning(_platformId: string, warning: string | null): Promise<void> {
    await this.updatePlatform({ understandingScopeWarning: warning });
  }

  async getEndpoints(): Promise<Endpoint[]> {
    return readJson<Endpoint[]>(path.join(this.dir, "endpoints.json"), []);
  }

  async insertEndpoints(platformId: string, endpoints: Array<Omit<Endpoint, "id" | "platformId">>): Promise<void> {
    const existing = await this.getEndpoints();
    const withIds: Endpoint[] = endpoints.map((e) => ({ ...e, id: randomUUID(), platformId }));
    await writeJson(path.join(this.dir, "endpoints.json"), [...existing, ...withIds]);
  }

  private async getChunks(): Promise<StoredChunk[]> {
    return readJson<StoredChunk[]>(path.join(this.dir, "chunks.json"), []);
  }

  async insertDocChunks(platformId: string, chunks: DocChunkInput[]): Promise<number> {
    const existing = await this.getChunks();
    const stored: StoredChunk[] = chunks.map((c) => ({
      id: randomUUID(),
      platformId,
      content: c.content,
      metadata: c.metadata,
      tokenCount: c.tokenCount,
      embedding: c.embedding,
    }));
    await writeJson(path.join(this.dir, "chunks.json"), [...existing, ...stored]);
    return stored.length;
  }

  async getRecentDocChunks(_platformId: string, limit: number): Promise<Array<{ id: string; content: string }>> {
    const chunks = await this.getChunks();
    return chunks
      .slice(-limit)
      .reverse()
      .map((c) => ({ id: c.id, content: c.content }));
  }

  async getRepresentativeDocChunks(
    _platformId: string,
    limit: number,
  ): Promise<{ chunks: Array<{ id: string; content: string }>; totalAvailable: number }> {
    const chunks = await this.getChunks();
    if (chunks.length <= limit) {
      return { chunks: chunks.map((c) => ({ id: c.id, content: c.content })), totalAvailable: chunks.length };
    }

    // Round-robin across source pages (one chunk from each page per round)
    // instead of just taking the last N crawled: a large doc site's
    // understanding shouldn't be built from whichever 2-3 pages happened
    // to be crawled last, it should see a slice of every page.
    const bySource = new Map<string, StoredChunk[]>();
    for (const chunk of chunks) {
      const key = chunk.metadata.sourceUrl ?? "";
      const group = bySource.get(key);
      if (group) group.push(chunk);
      else bySource.set(key, [chunk]);
    }
    const groups = [...bySource.values()];

    const sampled: StoredChunk[] = [];
    for (let round = 0; sampled.length < limit; round++) {
      const before = sampled.length;
      for (const group of groups) {
        if (round >= group.length) continue;
        sampled.push(group[round]!);
        if (sampled.length >= limit) break;
      }
      if (sampled.length === before) break; // every group exhausted
    }

    return {
      chunks: sampled.map((c) => ({ id: c.id, content: c.content })),
      totalAvailable: chunks.length,
    };
  }

  async hybridSearch(
    _platformId: string,
    queryEmbedding: number[],
    queryText: string,
    limit: number,
  ): Promise<HybridSearchResult[]> {
    const chunks = await this.getChunks();
    return localHybridSearch(chunks, queryEmbedding, queryText, limit);
  }

  async getUnderstanding(): Promise<PlatformUnderstanding | null> {
    return readJson<PlatformUnderstanding | null>(path.join(this.dir, "understanding.json"), null);
  }

  async upsertUnderstanding(platformId: string, data: PlatformUnderstanding): Promise<void> {
    const previous = await this.getUnderstanding();
    if (previous) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      await writeJson(path.join(historyDir(this.slug), `${timestamp}.json`), previous);
      await this.updatePlatform({
        history: [
          ...(await this.getPlatform()).history,
          { timestamp, trigger: "understanding-refresh", summary: "Understanding regenerated" },
        ],
      });
    }
    await writeJson(path.join(this.dir, "understanding.json"), data);
    void platformId;
  }

  async appendChatMessage(role: ChatRole, content: string, citations: unknown[]): Promise<ChatMessageRecord> {
    const record: ChatMessageRecord = {
      id: randomUUID(),
      role,
      content,
      citations,
      createdAt: new Date().toISOString(),
    };
    await appendJsonl(path.join(this.dir, "chat.jsonl"), record);
    return record;
  }

  async getChatHistory(): Promise<ChatMessageRecord[]> {
    const raw = await fs.readFile(path.join(this.dir, "chat.jsonl"), "utf-8").catch(() => "");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ChatMessageRecord);
  }

  async startAgentRun(params: {
    platformId: string;
    agent: AgentName;
    input: Record<string, unknown>;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    const record: AgentRunRecord = {
      id,
      platformId: params.platformId,
      agent: params.agent,
      status: "running",
      input: params.input,
      output: null,
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    await appendJsonl(path.join(this.dir, "agent-runs.jsonl"), record);
    return { id };
  }

  async completeAgentRun(id: string, output: Record<string, unknown>): Promise<void> {
    await appendJsonl(path.join(this.dir, "agent-runs.jsonl"), {
      id,
      status: "succeeded",
      output,
      finishedAt: new Date().toISOString(),
    });
  }

  async failAgentRun(id: string, error: string): Promise<void> {
    await appendJsonl(path.join(this.dir, "agent-runs.jsonl"), {
      id,
      status: "failed",
      error,
      finishedAt: new Date().toISOString(),
    });
  }

  async getAgentRuns(): Promise<AgentRunRecord[]> {
    const raw = await fs.readFile(path.join(this.dir, "agent-runs.jsonl"), "utf-8").catch(() => "");
    const lines = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Partial<AgentRunRecord> & { id: string });
    const byId = new Map<string, AgentRunRecord>();
    for (const line of lines) {
      const existing = byId.get(line.id);
      byId.set(line.id, { ...(existing ?? {}), ...line } as AgentRunRecord);
    }
    return [...byId.values()];
  }

  async setDocsHash(url: string, hash: string): Promise<void> {
    const current = await this.getPlatform();
    await this.updatePlatform({ lastDocsHash: { ...current.lastDocsHash, [url]: hash } });
  }

  async setDocUrls(docUrls: string[]): Promise<void> {
    await this.updatePlatform({ docUrls });
  }

  async setCrawlOptions(maxDepth: number, maxPages: number): Promise<void> {
    await this.updatePlatform({ crawlOptions: { maxDepth, maxPages } });
  }

  /** Clears indexed doc chunks before a `scout watch`-triggered re-crawl, so refreshed docs replace stale ones instead of duplicating them. */
  async resetDocChunks(): Promise<void> {
    await writeJson(path.join(this.dir, "chunks.json"), []);
  }

  async saveResources(resources: Resource[]): Promise<void> {
    await writeJson(path.join(this.dir, "resources.json"), resources);
  }

  async getResources(): Promise<Resource[]> {
    return readJson<Resource[]>(path.join(this.dir, "resources.json"), []);
  }
}

export type { DocChunkMetadata };
