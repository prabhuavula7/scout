import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_THREAD_ID, LocalFileStore } from "./local-file-store.js";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-store-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("LocalFileStore", () => {
  it("creates a run directory and opens it back up by slug", async () => {
    const { store, platformId } = await LocalFileStore.create("Contentful", "contentful");
    expect(store.slug).toBe("contentful");

    const opened = await LocalFileStore.open("contentful");
    expect(opened?.platformId).toBe(platformId);
  });

  it("dedupes slugs for repeated labels", async () => {
    const first = await LocalFileStore.create("Contentful", "contentful");
    const second = await LocalFileStore.create("Contentful", "contentful");
    expect(first.store.slug).toBe("contentful");
    expect(second.store.slug).toBe("contentful-2");
  });

  it("tracks agent run status across start/complete/fail", async () => {
    const { store, platformId } = await LocalFileStore.create("GitHub", "github");
    const { id } = await store.startAgentRun({ platformId, agent: "import", input: {} });
    await store.completeAgentRun(id, { ok: true });

    const runs = await store.getAgentRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe("succeeded");
  });

  it("archives the previous understanding snapshot to history on update", async () => {
    const { store, platformId } = await LocalFileStore.create("Bynder", "bynder");
    const base = {
      platformId,
      summary: "v1",
      architectureOverview: "",
      authenticationFlow: "",
      dataModel: [],
      entityRelationships: [],
      commonWorkflows: [],
      integrationOpportunities: [],
      potentialPitfalls: [],
      missingDocumentation: [],
      securityObservations: [],
      mermaidSequenceDiagram: "",
      mermaidErDiagram: "",
      citations: [],
      generatedAt: new Date().toISOString(),
    };

    await store.upsertUnderstanding(platformId, base);
    await store.upsertUnderstanding(platformId, { ...base, summary: "v2" });

    const current = await store.getUnderstanding();
    expect(current?.summary).toBe("v2");

    const platform = await store.getPlatform();
    expect(platform.history).toHaveLength(1);

    const historyFiles = await fs.readdir(path.join(store.dir, "history"));
    expect(historyFiles).toHaveLength(1);
  });

  it("lists runs across the runs root sorted by most recently updated", async () => {
    await LocalFileStore.create("Older", "older");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await LocalFileStore.create("Newer", "newer");

    const runs = await LocalFileStore.list();
    expect(runs.map((r) => r.slug)).toEqual(["newer", "older"]);
  });

  describe("chat threads", () => {
    it("has no threads for a fresh run", async () => {
      const { store } = await LocalFileStore.create("Fresh", "fresh");
      expect(await store.listChatThreads()).toEqual([]);
    });

    it("creates, lists, renames, and deletes threads", async () => {
      const { store } = await LocalFileStore.create("Threaded", "threaded");
      const first = await store.createChatThread("First");
      const second = await store.createChatThread();
      expect(second.title).toBe("New thread");

      const listed = await store.listChatThreads();
      expect(listed.map((t) => t.id).sort()).toEqual([first.id, second.id].sort());

      await store.renameChatThread(first.id, "Renamed");
      expect((await store.listChatThreads()).find((t) => t.id === first.id)?.title).toBe("Renamed");

      await store.deleteChatThread(second.id);
      expect((await store.listChatThreads()).map((t) => t.id)).toEqual([first.id]);
    });

    it("scopes messages to their own thread", async () => {
      const { store } = await LocalFileStore.create("Scoped", "scoped");
      const other = await store.createChatThread("Other");

      await store.appendChatMessage(DEFAULT_THREAD_ID, "user", "hello main", []);
      await store.appendChatMessage(other.id, "user", "hello other", []);

      expect((await store.getChatHistory(DEFAULT_THREAD_ID)).map((m) => m.content)).toEqual(["hello main"]);
      expect((await store.getChatHistory(other.id)).map((m) => m.content)).toEqual(["hello other"]);
    });

    it("migrates pre-threads chat history into a synthesized Main thread", async () => {
      const { store } = await LocalFileStore.create("Legacy", "legacy");
      // Simulate a message written before threadId existed.
      await fs.appendFile(
        path.join(store.dir, "chat.jsonl"),
        `${JSON.stringify({ id: "legacy-1", role: "user", content: "old message", citations: [], createdAt: new Date().toISOString() })}\n`,
        "utf-8",
      );

      const threads = await store.listChatThreads();
      expect(threads).toHaveLength(1);
      expect(threads[0]!.id).toBe(DEFAULT_THREAD_ID);
      expect(threads[0]!.title).toBe("Main");

      const history = await store.getChatHistory(DEFAULT_THREAD_ID);
      expect(history.map((m) => m.content)).toEqual(["old message"]);
    });

    it("bumps a thread's updatedAt and sorts listChatThreads newest-first", async () => {
      const { store } = await LocalFileStore.create("Ordered", "ordered");
      const first = await store.createChatThread("First");
      await new Promise((resolve) => setTimeout(resolve, 5));
      await store.appendChatMessage(first.id, "user", "hi", []);
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await store.createChatThread("Second");

      const listed = await store.listChatThreads();
      expect(listed[0]!.id).toBe(second.id);
      expect(listed[1]!.id).toBe(first.id);
    });
  });

  describe("getRepresentativeDocChunks", () => {
    function chunkInput(sourceUrl: string, content: string) {
      return {
        content,
        metadata: { sourceUrl, sourceTitle: sourceUrl, section: null, topic: "general" as const },
        tokenCount: 10,
        embedding: [0.1],
      };
    }

    it("returns everything and the true total when under the limit", async () => {
      const { store, platformId } = await LocalFileStore.create("Small Docs", "custom");
      await store.insertDocChunks(platformId, [chunkInput("https://a.com", "a1"), chunkInput("https://b.com", "b1")]);

      const result = await store.getRepresentativeDocChunks!(platformId, 10);
      expect(result.totalAvailable).toBe(2);
      expect(result.chunks).toHaveLength(2);
    });

    it("spreads the sample evenly across source pages instead of favoring whatever was crawled last", async () => {
      const { store, platformId } = await LocalFileStore.create("Big Docs", "custom");
      // Page A has 5 chunks, crawled first; page B has 1 chunk, crawled last.
      // A naive "last N" selection would return only page B's single chunk.
      await store.insertDocChunks(
        platformId,
        Array.from({ length: 5 }, (_, i) => chunkInput("https://a.com", `a${i}`)),
      );
      await store.insertDocChunks(platformId, [chunkInput("https://b.com", "b0")]);

      const result = await store.getRepresentativeDocChunks!(platformId, 2);
      expect(result.totalAvailable).toBe(6);
      const sources = result.chunks.map((c) => c.content[0]);
      expect(sources).toContain("a");
      expect(sources).toContain("b");
    });
  });
});
