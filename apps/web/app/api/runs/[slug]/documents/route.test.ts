import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileStore } from "@scout/store";

vi.mock("@/lib/server-config", () => ({
  resolveLLMProvider: vi.fn(async () => ({
    name: "fake",
    complete: vi.fn(),
    embed: vi.fn(async (texts: string[]) => texts.map(() => [0.1, 0.2, 0.3])),
  })),
  resolveSearchProvider: vi.fn(async () => undefined),
}));

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-documents-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("GET /api/runs/[slug]/documents", () => {
  it("404s for a run that doesn't exist", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug: "nope" }) });
    expect(response.status).toBe(404);
  });

  it("lists every doc source for a run", async () => {
    const { store, platformId } = await LocalFileStore.create("Docs List Platform", "custom");
    await store.insertDocChunks(platformId, [
      {
        content: "content",
        metadata: { sourceUrl: "scout-upload://p/notes.md", sourceTitle: "notes.md", section: null, topic: "general", origin: "upload" },
        tokenCount: 5,
        embedding: [0.1],
      },
    ]);

    const { GET } = await import("./route.js");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug: store.slug }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].origin).toBe("upload");
  });
});

// jsdom's Request/FormData/File don't actually implement streaming body
// parsing in this environment (request.formData() hangs, and its File lacks
// a working arrayBuffer()), so a real multipart Request can't be exercised
// end-to-end here. This fakes just the shape the route handler duck-types
// against (name + arrayBuffer()), testing our routing logic rather than
// jsdom's incomplete Fetch polyfill.
function multipartRequest(filename: string, content: string): Request {
  const file = { name: filename, arrayBuffer: async () => new TextEncoder().encode(content).buffer };
  return {
    headers: new Headers({ "content-type": "multipart/form-data; boundary=x" }),
    formData: async () => ({ get: (key: string) => (key === "file" ? file : null) }),
  } as unknown as Request;
}

describe("POST /api/runs/[slug]/documents", () => {
  it("404s for a run that doesn't exist", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ url: "https://x.com" }) }), {
      params: Promise.resolve({ slug: "nope" }),
    });
    expect(response.status).toBe(404);
  });

  it("attaches an uploaded file via multipart form data", async () => {
    const { store } = await LocalFileStore.create("Docs Upload Platform", "custom");
    const content = `## Runbook\n\n${"Retry failed webhooks up to five times with exponential backoff. ".repeat(4)}`;

    const { POST } = await import("./route.js");
    const response = await POST(multipartRequest("runbook.md", content), { params: Promise.resolve({ slug: store.slug }) });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.chunksStored).toBeGreaterThan(0);
    expect(body.sourceTitle).toBe("runbook.md");
  });

  it("attaches a link via a JSON body", async () => {
    const { store } = await LocalFileStore.create("Docs Link Platform", "custom");
    const html = `<html><head><title>API guide</title></head><body><main><p>${"Rate limits reset every minute. ".repeat(
      6,
    )}</p></main></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        arrayBuffer: async () => new TextEncoder().encode(html).buffer,
      }),
    );

    const { POST } = await import("./route.js");
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ url: "https://blog.example.com/api-guide" }) }),
      { params: Promise.resolve({ slug: store.slug }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sourceTitle).toBe("API guide");
  });

  it("400s with a clear error for an unsupported file type", async () => {
    const { store } = await LocalFileStore.create("Docs Bad Type Platform", "custom");

    const { POST } = await import("./route.js");
    const response = await POST(multipartRequest("archive.zip", "binary junk"), { params: Promise.resolve({ slug: store.slug }) });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/unsupported file type/i);
  });
});

describe("DELETE /api/runs/[slug]/documents", () => {
  it("removes chunks for the given sourceUrl", async () => {
    const { store, platformId } = await LocalFileStore.create("Docs Delete Platform", "custom");
    await store.insertDocChunks(platformId, [
      {
        content: "content",
        metadata: { sourceUrl: "scout-upload://p/notes.md", sourceTitle: "notes.md", section: null, topic: "general", origin: "upload" },
        tokenCount: 5,
        embedding: [0.1],
      },
    ]);

    const { DELETE } = await import("./route.js");
    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ sourceUrl: "scout-upload://p/notes.md" }) }),
      { params: Promise.resolve({ slug: store.slug }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.removed).toBe(1);

    const remaining = await store.listDocSources!(platformId);
    expect(remaining).toHaveLength(0);
  });
});
