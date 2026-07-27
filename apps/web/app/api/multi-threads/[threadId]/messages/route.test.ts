import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalFileStore, MultiRunThreadStore } from "@scout/store";

vi.mock("@/lib/server-config", () => ({
  resolveLLMProvider: vi.fn(async () => ({ name: "fake" })),
  resolveSearchProvider: vi.fn(async () => undefined),
}));
vi.mock("@scout/agents", () => ({
  runAgenticChatAgent: vi.fn(),
}));

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-multi-thread-messages-test-"));
  process.env.SCOUT_HOME = tmpHome;
  vi.clearAllMocks();
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function postRequest(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}

describe("GET /api/multi-threads/[threadId]/messages", () => {
  it("404s for a thread that doesn't exist", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ threadId: "nope" }) });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/multi-threads/[threadId]/messages", () => {
  it("saves the user message and the assistant reply, calling runAgenticChatAgent with every platform in scope", async () => {
    await LocalFileStore.create("Stripe Clone", "custom");
    await LocalFileStore.create("Hubspot Clone", "custom");
    const thread = await MultiRunThreadStore.create(["stripe-clone", "hubspot-clone"], "Cross-platform");

    const { runAgenticChatAgent } = await import("@scout/agents");
    (runAgenticChatAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
      answer: "Both platforms use webhooks.",
      sources: [{ type: "docs", ref: "https://a.com", title: "A", platformSlug: "stripe-clone" }],
    });

    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ message: "How do these two sync?" }), {
      params: Promise.resolve({ threadId: thread.id }),
    });

    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.content).toBe("Both platforms use webhooks.");

    const platformsArg = (runAgenticChatAgent as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(platformsArg.map((p: { slug: string }) => p.slug).sort()).toEqual(["hubspot-clone", "stripe-clone"]);
  });

  it("409s when one of the thread's platforms no longer exists", async () => {
    await LocalFileStore.create("Still Here", "custom");
    const thread = await MultiRunThreadStore.create(["still-here", "deleted-run"], "Broken");

    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ message: "hi" }), { params: Promise.resolve({ threadId: thread.id }) });
    expect(response.status).toBe(409);
  });

  it("still persists the user's message even when the reply fails", async () => {
    await LocalFileStore.create("Flaky A", "custom");
    await LocalFileStore.create("Flaky B", "custom");
    const thread = await MultiRunThreadStore.create(["flaky-a", "flaky-b"]);

    const { runAgenticChatAgent } = await import("@scout/agents");
    (runAgenticChatAgent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));

    const { POST } = await import("./route.js");
    await POST(postRequest({ message: "Will this be saved?" }), { params: Promise.resolve({ threadId: thread.id }) });

    const history = await MultiRunThreadStore.getHistory(thread.id);
    expect(history).toHaveLength(1);
    expect(history[0]!.content).toBe("Will this be saved?");
  });
});
