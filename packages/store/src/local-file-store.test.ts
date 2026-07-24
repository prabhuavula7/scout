import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore } from "./local-file-store.js";

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
