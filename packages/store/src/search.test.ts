import { describe, expect, it } from "vitest";
import { localHybridSearch, type StoredChunk } from "./search.js";

function makeChunk(overrides: Partial<StoredChunk> = {}): StoredChunk {
  return {
    id: crypto.randomUUID(),
    platformId: "platform-1",
    content: "Webhooks are signed with an HMAC-SHA256 signature.",
    metadata: { sourceUrl: "https://example.com/docs", sourceTitle: "Docs", section: null, topic: "webhooks" },
    tokenCount: 10,
    embedding: [1, 0, 0],
    ...overrides,
  };
}

describe("localHybridSearch", () => {
  it("returns an empty array for no chunks", () => {
    expect(localHybridSearch([], [1, 0, 0], "webhooks", 5)).toEqual([]);
  });

  it("ranks the closest embedding highest", () => {
    const close = makeChunk({ embedding: [1, 0, 0], content: "close match" });
    const far = makeChunk({ embedding: [0, 1, 0], content: "far match" });
    const results = localHybridSearch([far, close], [1, 0, 0], "unrelated query", 5);
    expect(results[0]!.content).toBe("close match");
  });

  it("boosts a chunk that also matches the query text", () => {
    const keywordMatch = makeChunk({ embedding: [0.9, 0.1, 0], content: "signature verification steps" });
    const noKeyword = makeChunk({ embedding: [0.9, 0.1, 0], content: "unrelated pagination details" });
    const results = localHybridSearch([noKeyword, keywordMatch], [1, 0, 0], "signature verification", 5);
    expect(results[0]!.content).toBe("signature verification steps");
  });

  it("respects the limit", () => {
    const chunks = Array.from({ length: 10 }, (_, i) => makeChunk({ embedding: [1, i * 0.01, 0] }));
    const results = localHybridSearch(chunks, [1, 0, 0], "anything", 3);
    expect(results).toHaveLength(3);
  });
});
