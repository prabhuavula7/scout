import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileStore } from "@scout/store";

vi.mock("@/lib/server-config", () => ({
  resolveLLMProvider: vi.fn(async () => ({ name: "fake" })),
  resolveSearchProvider: vi.fn(async () => undefined),
}));
vi.mock("@scout/agents", () => ({
  runAgenticChatAgent: vi.fn(),
}));

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-chat-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("POST /api/runs/[slug]/chat", () => {
  it("404s for a run that doesn't exist", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ message: "hi" }) }),
      { params: Promise.resolve({ slug: "nope" }) },
    );
    expect(response.status).toBe(404);
  });

  it("saves the user message and the assistant reply on success", async () => {
    await LocalFileStore.create("Chatty Platform", "custom");
    const { runAgenticChatAgent } = await import("@scout/agents");
    (runAgenticChatAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ answer: "The auth scheme is bearer token.", sources: [] });

    const { POST } = await import("./route.js");
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ message: "How do I auth?" }) }),
      { params: Promise.resolve({ slug: "chatty-platform" }) },
    );

    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.role).toBe("assistant");
    expect(saved.content).toBe("The auth scheme is bearer token.");
  });

  it("returns a clear 502 error (not an unhandled crash) when the LLM call fails", async () => {
    await LocalFileStore.create("Misconfigured Platform", "custom");
    const { runAgenticChatAgent } = await import("@scout/agents");
    (runAgenticChatAgent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Invalid API key"));

    const { POST } = await import("./route.js");
    const response = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ message: "How do I auth?" }) }),
      { params: Promise.resolve({ slug: "misconfigured-platform" }) },
    );

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("Invalid API key");
  });

  it("still persists the user's message even when the reply fails", async () => {
    const { store } = await LocalFileStore.create("Retry Platform", "custom");
    const { runAgenticChatAgent } = await import("@scout/agents");
    (runAgenticChatAgent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    const { POST } = await import("./route.js");
    await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ message: "Will this be saved?" }) }),
      { params: Promise.resolve({ slug: "retry-platform" }) },
    );

    const history = await store.getChatHistory();
    expect(history).toHaveLength(1);
    expect(history[0]!.content).toBe("Will this be saved?");
  });
});
