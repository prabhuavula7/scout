import { describe, expect, it, vi } from "vitest";
import { runResearchAgent } from "./research-agent.js";
import type { SearchProvider } from "./search/provider.js";

describe("runResearchAgent", () => {
  it("returns an empty array when no search provider is configured", async () => {
    const result = await runResearchAgent(undefined, "Contentful");
    expect(result).toEqual([]);
  });

  it("delegates to the configured search provider with a use-case query", async () => {
    const provider: SearchProvider = {
      name: "test",
      search: vi.fn().mockResolvedValue([{ title: "Getting started with Contentful", url: "https://example.com/a", snippet: "a" }]),
    };

    const result = await runResearchAgent(provider, "Contentful", 3);

    expect(provider.search).toHaveBeenCalledWith("Contentful API integration tutorial use cases", 3);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe("Getting started with Contentful");
  });
});
