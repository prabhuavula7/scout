import { afterEach, describe, expect, it, vi } from "vitest";
import { runResearchAgent } from "./research-agent.js";

describe("runResearchAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty array when no API key is configured", async () => {
    const result = await runResearchAgent(undefined, "Contentful");
    expect(result).toEqual([]);
  });

  it("parses Tavily results into Resource objects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: "Getting started with Contentful", url: "https://example.com/a", content: "a".repeat(400) },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runResearchAgent("test-key", "Contentful");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Getting started with Contentful");
    expect(result[0]!.snippet.length).toBeLessThanOrEqual(280);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(runResearchAgent("bad-key", "Contentful")).rejects.toThrow("Tavily search failed");
  });
});
