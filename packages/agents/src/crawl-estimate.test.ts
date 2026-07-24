import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateCrawlCost, formatCrawlEstimate } from "./crawl-estimate.js";

describe("estimateCrawlCost", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sums content-length across seed URLs that report one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": "4000" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const estimate = await estimateCrawlCost(["https://a.com", "https://b.com"], { maxDepth: 1, maxPages: 20 });

    expect(estimate.seedUrlCount).toBe(2);
    expect(estimate.knownBytes).toBe(8000);
    expect(estimate.estimatedTokens).toBe(2000);
  });

  it("skips URLs it can't get a size for, without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const estimate = await estimateCrawlCost(["https://unreachable.example.com"]);

    expect(estimate.knownBytes).toBe(0);
    expect(estimate.seedUrlCount).toBe(1);
  });

  it("falls back to a ranged GET when HEAD has no content-length", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, headers: new Headers() })
      .mockResolvedValueOnce({ ok: true, headers: new Headers({ "content-length": "1200" }) });
    vi.stubGlobal("fetch", fetchMock);

    const estimate = await estimateCrawlCost(["https://a.com"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(estimate.knownBytes).toBe(1200);
  });
});

describe("formatCrawlEstimate", () => {
  it("includes byte/token counts when known", () => {
    const text = formatCrawlEstimate({
      seedUrlCount: 2,
      knownBytes: 8192,
      estimatedTokens: 2048,
      maxDepth: 1,
      maxPages: 20,
    });
    expect(text).toContain("2 doc URL(s)");
    expect(text).toContain("2,048 tokens");
    expect(text).toContain("depends on your configured provider's pricing");
  });

  it("omits the byte estimate when nothing was measurable", () => {
    const text = formatCrawlEstimate({ seedUrlCount: 1, knownBytes: 0, estimatedTokens: 0, maxDepth: 0, maxPages: 20 });
    expect(text).not.toContain("tokens from");
  });
});
