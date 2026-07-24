import { afterEach, describe, expect, it, vi } from "vitest";
import { TavilyProvider } from "./tavily.js";

describe("TavilyProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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

    const result = await new TavilyProvider("test-key").search("Contentful API integration tutorial use cases", 6);

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
    await expect(new TavilyProvider("bad-key").search("query", 6)).rejects.toThrow("Tavily search failed");
  });
});
