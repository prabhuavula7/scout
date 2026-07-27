import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStore, DocChunkInput } from "@scout/store";
import type { LLMProvider } from "@scout/ai";
import { MAX_UPLOAD_BYTES, runUploadFileAgent, runUploadLinkAgent } from "./upload-docs-agent.js";

function fakeStore(): { store: AgentStore; stored: DocChunkInput[] } {
  const stored: DocChunkInput[] = [];
  const store = {
    insertDocChunks: vi.fn(async (_platformId: string, chunks: DocChunkInput[]) => {
      stored.push(...chunks);
      return chunks.length;
    }),
  } as unknown as AgentStore;
  return { store, stored };
}

function fakeLLM(): LLMProvider {
  return {
    name: "fake",
    complete: vi.fn(),
    completeStructured: vi.fn(),
    streamComplete: vi.fn(),
    completeWithTools: vi.fn(),
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
  };
}

describe("runUploadFileAgent", () => {
  it("chunks and embeds a plain text file", async () => {
    const { store, stored } = fakeStore();
    const buffer = Buffer.from(
      `## Authentication\n\nUse a bearer token in the Authorization header for every request. ${"Rate limits apply after 100 requests per minute. ".repeat(5)}`,
    );

    const result = await runUploadFileAgent(store, fakeLLM(), "platform-1", { filename: "notes.md", buffer });

    expect(result.chunksStored).toBeGreaterThan(0);
    expect(result.sourceUrl).toBe(`scout-upload://platform-1/notes.md`);
    expect(result.warning).toBeNull();
    expect(stored[0]!.metadata.origin).toBe("upload");
    expect(stored[0]!.metadata.sourceTitle).toBe("notes.md");
  });

  it("parses a csv file via officeparser", async () => {
    const { store } = fakeStore();
    const buffer = Buffer.from("endpoint,method\n/users,GET\n/users/:id,DELETE\n");

    const result = await runUploadFileAgent(store, fakeLLM(), "platform-1", { filename: "endpoints.csv", buffer });

    expect(result.chunksStored).toBeGreaterThan(0);
  });

  it("rejects an unsupported file extension", async () => {
    const { store } = fakeStore();
    await expect(
      runUploadFileAgent(store, fakeLLM(), "platform-1", { filename: "archive.zip", buffer: Buffer.from("x") }),
    ).rejects.toThrow(/unsupported file type/i);
  });

  it("rejects a file over the size limit", async () => {
    const { store } = fakeStore();
    const buffer = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    await expect(
      runUploadFileAgent(store, fakeLLM(), "platform-1", { filename: "big.txt", buffer }),
    ).rejects.toThrow(/over the/i);
  });

  it("throws instead of silently storing nothing when extraction yields no content", async () => {
    const { store } = fakeStore();
    await expect(
      runUploadFileAgent(store, fakeLLM(), "platform-1", { filename: "empty.txt", buffer: Buffer.from("   \n\n  ") }),
    ).rejects.toThrow(/couldn't extract/i);
  });

  it("flags suspiciously short (but non-empty) extracted content as a warning, not an error", async () => {
    const { store } = fakeStore();
    const result = await runUploadFileAgent(store, fakeLLM(), "platform-1", {
      filename: "short.txt",
      buffer: Buffer.from("just a few words"),
    });
    expect(result.warning).toMatch(/only \d+ character/i);
  });
});

describe("runUploadLinkAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches a link, extracts its title, and stores chunks tagged origin: link", async () => {
    const html = `<html><head><title>Rate limits</title></head><body><main><h2>Rate limits</h2><p>${"x".repeat(
      300,
    )}</p></main></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        arrayBuffer: async () => new TextEncoder().encode(html).buffer,
      }),
    );

    const { store, stored } = fakeStore();
    const result = await runUploadLinkAgent(store, fakeLLM(), "platform-1", { url: "https://blog.example.com/rate-limits" });

    expect(result.sourceUrl).toBe("https://blog.example.com/rate-limits");
    expect(result.sourceTitle).toBe("Rate limits");
    expect(stored[0]!.metadata.origin).toBe("link");
  });

  it("refuses a Google Drive share link with a clear explanation", async () => {
    const { store } = fakeStore();
    await expect(
      runUploadLinkAgent(store, fakeLLM(), "platform-1", { url: "https://drive.google.com/file/d/abc123/view" }),
    ).rejects.toThrow(/google drive/i);
  });

  it("surfaces a clear error when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const { store } = fakeStore();
    await expect(
      runUploadLinkAgent(store, fakeLLM(), "platform-1", { url: "https://example.com/missing" }),
    ).rejects.toThrow(/404/);
  });

  it("rejects a link whose declared content-length is over the size limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-length": String(MAX_UPLOAD_BYTES + 1) }),
      }),
    );
    const { store } = fakeStore();
    await expect(
      runUploadLinkAgent(store, fakeLLM(), "platform-1", { url: "https://example.com/huge.pdf" }),
    ).rejects.toThrow(/over the/i);
  });
});
