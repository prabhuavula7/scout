import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStore, DocChunkInput } from "@scout/store";
import type { LLMProvider } from "@scout/ai";
import { runDocumentationAgent } from "./documentation-agent.js";

function fakeStore(): AgentStore {
  const stored: DocChunkInput[] = [];
  return {
    insertDocChunks: vi.fn(async (_platformId: string, chunks: DocChunkInput[]) => {
      stored.push(...chunks);
      return chunks.length;
    }),
  } as unknown as AgentStore;
}

function fakeLLM(): LLMProvider {
  return {
    name: "fake",
    complete: vi.fn(),
    completeStructured: vi.fn(),
    streamComplete: vi.fn(),
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
  };
}

function htmlResponse(html: string) {
  return { ok: true, text: async () => html };
}

describe("runDocumentationAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("crawls exactly the seed URLs when maxDepth is 0 (old fixed-set behavior)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse(
        `<html><head><title>Docs</title></head><body><main><h1>Auth</h1><p>${"x".repeat(600)}</p><a href="/other">Other</a></main></body></html>`,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDocumentationAgent(fakeStore(), fakeLLM(), "platform-1", ["https://docs.example.com/auth"], {
      maxDepth: 0,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.pagesCrawled).toBe(1);
  });

  it("follows same-origin links up to maxDepth", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://docs.example.com/start") {
        return htmlResponse(
          `<html><head><title>Start</title></head><body><main><p>${"x".repeat(600)}</p></main><a href="/next">Next</a><a href="https://other-site.com/x">External</a></body></html>`,
        );
      }
      return htmlResponse(`<html><head><title>Next</title></head><body><main><p>${"y".repeat(600)}</p></main></body></html>`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDocumentationAgent(fakeStore(), fakeLLM(), "platform-1", ["https://docs.example.com/start"], {
      maxDepth: 1,
      maxPages: 10,
    });

    expect(result.pagesCrawled).toBe(2);
    const fetchedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(fetchedUrls).toContain("https://docs.example.com/start");
    expect(fetchedUrls).toContain("https://docs.example.com/next");
    expect(fetchedUrls).not.toContain("https://other-site.com/x");
  });

  it("stops at maxPages even if more links are discovered", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = new URL(String(input));
      const n = Number(url.pathname.replace("/page", "")) || 0;
      return htmlResponse(
        `<html><head><title>P${n}</title></head><body><main><p>${"x".repeat(600)}</p></main><a href="/page${n + 1}">Next</a></body></html>`,
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDocumentationAgent(fakeStore(), fakeLLM(), "platform-1", ["https://docs.example.com/page0"], {
      maxDepth: 5,
      maxPages: 3,
    });

    expect(result.pagesCrawled).toBe(3);
  });

  it("flags pages with suspiciously little extracted content as thin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      htmlResponse(`<html><head><title>Empty shell</title></head><body><main><div id="app"></div></main></body></html>`),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDocumentationAgent(fakeStore(), fakeLLM(), "platform-1", ["https://docs.example.com/spa"], {
      maxDepth: 0,
    });

    expect(result.thinPages).toEqual(["https://docs.example.com/spa"]);
  });

  it("skips a discovered link that 404s instead of aborting the whole crawl (regression: a single dead link found via recursion used to fail the entire run)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://docs.example.com/start") {
        return htmlResponse(
          `<html><head><title>Start</title></head><body><main><p>${"x".repeat(600)}</p></main><a href="/dead-link">Dead</a><a href="/fine">Fine</a></body></html>`,
        );
      }
      if (url === "https://docs.example.com/dead-link") {
        return { ok: false, status: 404, text: async () => "" };
      }
      return htmlResponse(`<html><head><title>Fine</title></head><body><main><p>${"y".repeat(600)}</p></main></body></html>`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDocumentationAgent(fakeStore(), fakeLLM(), "platform-1", ["https://docs.example.com/start"], {
      maxDepth: 1,
      maxPages: 10,
    });

    expect(result.failedPages).toEqual([
      { url: "https://docs.example.com/dead-link", error: expect.stringContaining("HTTP 404") },
    ]);
    // The seed page and the other discovered link still succeeded.
    const fetchedUrls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(fetchedUrls).toContain("https://docs.example.com/fine");
  });

  it("skips a broken seed URL without throwing, so other seed URLs still get crawled", async () => {
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL) => {
      const url = String(input);
      if (url === "https://docs.example.com/broken") return { ok: false, status: 500, text: async () => "" };
      return htmlResponse(`<html><head><title>Good</title></head><body><main><p>${"x".repeat(600)}</p></main></body></html>`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runDocumentationAgent(
      fakeStore(),
      fakeLLM(),
      "platform-1",
      ["https://docs.example.com/broken", "https://docs.example.com/good"],
      { maxDepth: 0 },
    );

    expect(result.failedPages).toHaveLength(1);
    expect(result.failedPages[0]!.url).toBe("https://docs.example.com/broken");
    expect(result.chunksStored).toBeGreaterThan(0);
  });
});
