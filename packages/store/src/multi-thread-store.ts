import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChatRole } from "@scout/types";
import { appendJsonl, readJson, readJsonl, writeJson } from "./fs-json.js";
import { threadsRoot } from "./paths.js";

export interface MultiRunThreadRecord {
  id: string;
  title: string;
  /** Every run slug this thread is grounded in. Always 2+ -- a single-run
   * thread stays in that run's own LocalFileStore instead. */
  platformSlugs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MultiRunChatMessageRecord {
  id: string;
  role: ChatRole;
  content: string;
  citations: unknown[];
  createdAt: string;
}

function threadDir(id: string): string {
  return path.join(threadsRoot(), id);
}

/**
 * Storage for threads that span more than one run. A single-run thread
 * lives inside that run's own LocalFileStore directory (ChatThreadRecord,
 * unchanged by this); a multi-run thread doesn't belong to any one run's
 * directory, so it gets its own top-level home under
 * ~/.scout/threads/<threadId>/, mirroring the same thread.json + chat.jsonl
 * shape LocalFileStore already uses for single-run threads.
 */
export class MultiRunThreadStore {
  static async list(): Promise<MultiRunThreadRecord[]> {
    const root = threadsRoot();
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    const records: MultiRunThreadRecord[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const record = await readJson<MultiRunThreadRecord | null>(path.join(root, entry.name, "thread.json"), null);
      if (record) records.push(record);
    }
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  static async create(platformSlugs: string[], title?: string): Promise<MultiRunThreadRecord> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const record: MultiRunThreadRecord = {
      id,
      title: title?.trim() || "New thread",
      platformSlugs,
      createdAt: now,
      updatedAt: now,
    };
    await writeJson(path.join(threadDir(id), "thread.json"), record);
    return record;
  }

  static async get(id: string): Promise<MultiRunThreadRecord | null> {
    return readJson<MultiRunThreadRecord | null>(path.join(threadDir(id), "thread.json"), null);
  }

  static async rename(id: string, title: string): Promise<void> {
    const record = await MultiRunThreadStore.get(id);
    if (!record) return;
    await writeJson(path.join(threadDir(id), "thread.json"), { ...record, title, updatedAt: new Date().toISOString() });
  }

  static async remove(id: string): Promise<void> {
    await fs.rm(threadDir(id), { recursive: true, force: true });
  }

  private static async touch(id: string): Promise<void> {
    const record = await MultiRunThreadStore.get(id);
    if (!record) return;
    await writeJson(path.join(threadDir(id), "thread.json"), { ...record, updatedAt: new Date().toISOString() });
  }

  static async appendMessage(id: string, role: ChatRole, content: string, citations: unknown[]): Promise<MultiRunChatMessageRecord> {
    const record: MultiRunChatMessageRecord = { id: randomUUID(), role, content, citations, createdAt: new Date().toISOString() };
    await appendJsonl(path.join(threadDir(id), "chat.jsonl"), record);
    await MultiRunThreadStore.touch(id);
    return record;
  }

  static async getHistory(id: string): Promise<MultiRunChatMessageRecord[]> {
    return readJsonl<MultiRunChatMessageRecord>(path.join(threadDir(id), "chat.jsonl"));
  }
}
