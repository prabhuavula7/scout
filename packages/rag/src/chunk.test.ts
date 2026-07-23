import { describe, expect, it } from "vitest";
import { chunkDocument } from "./chunk.js";

describe("chunkDocument", () => {
  it("splits markdown into sections by heading", () => {
    const markdown = `## Authentication\n\nUse a bearer token.\n\n## Pagination\n\nUse cursor-based pagination with the \`next\` field.`;

    const chunks = chunkDocument({
      markdown,
      sourceUrl: "https://example.com/docs",
      sourceTitle: "Docs",
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.metadata.section).toBe("Authentication");
    expect(chunks[0]!.metadata.topic).toBe("authentication");
    expect(chunks[1]!.metadata.section).toBe("Pagination");
    expect(chunks[1]!.metadata.topic).toBe("pagination");
  });

  it("splits an oversized section into multiple token-bounded chunks", () => {
    const longParagraph = Array.from({ length: 200 }, (_, i) => `sentence number ${i}.`).join(
      " ",
    );
    const markdown = `## Overview\n\n${longParagraph}\n\n${longParagraph}\n\n${longParagraph}`;

    const chunks = chunkDocument({
      markdown,
      sourceUrl: "https://example.com/docs",
      sourceTitle: "Docs",
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(560); // budget + overlap slack
    }
  });

  it("returns an empty array for a document with no content", () => {
    expect(chunkDocument({ markdown: "   \n\n  ", sourceUrl: "https://x.com", sourceTitle: "X" })).toEqual(
      [],
    );
  });

  it("tags webhook content correctly even without a heading", () => {
    const chunks = chunkDocument({
      markdown: "Configure a webhook endpoint to receive real-time events.",
      sourceUrl: "https://example.com/docs",
      sourceTitle: "Docs",
    });

    expect(chunks[0]!.metadata.topic).toBe("webhooks");
    expect(chunks[0]!.metadata.section).toBeNull();
  });
});
