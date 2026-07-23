import { describe, expect, it } from "vitest";
import { buildContextAndCitations } from "./citations.js";
import type { HybridSearchResult } from "@scout/store";

function makeResult(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    platformId: "22222222-2222-2222-2222-222222222222",
    content: "Webhooks are signed with an HMAC-SHA256 signature in the X-Signature header.",
    metadata: {
      sourceUrl: "https://example.com/docs/webhooks",
      sourceTitle: "Webhooks",
      section: "Verifying signatures",
      topic: "webhooks",
    },
    tokenCount: 20,
    score: 0.9,
    ...overrides,
  };
}

describe("buildContextAndCitations", () => {
  it("numbers each source and preserves order", () => {
    const results = [makeResult(), makeResult({ id: "3", metadata: { ...makeResult().metadata, sourceTitle: "Pagination" } })];
    const { contextBlock } = buildContextAndCitations(results);

    expect(contextBlock).toContain("[1] Source: Webhooks");
    expect(contextBlock).toContain("[2] Source: Pagination");
  });

  it("produces one citation per retrieved chunk with a truncated quote", () => {
    const longContent = "x".repeat(500);
    const results = [makeResult({ content: longContent })];
    const { citations } = buildContextAndCitations(results);

    expect(citations).toHaveLength(1);
    expect(citations[0]!.quote.length).toBeLessThanOrEqual(240);
    expect(citations[0]!.chunkId).toBe(results[0]!.id);
  });

  it("returns no citations for an empty result set", () => {
    const { citations, contextBlock } = buildContextAndCitations([]);
    expect(citations).toEqual([]);
    expect(contextBlock).toBe("");
  });
});
