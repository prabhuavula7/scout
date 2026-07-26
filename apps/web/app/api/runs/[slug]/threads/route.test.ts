import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore } from "@scout/store";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-threads-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("/api/runs/[slug]/threads", () => {
  it("404s for a run that doesn't exist", async () => {
    const { GET } = await import("./route.js");
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ slug: "nope" }) });
    expect(response.status).toBe(404);
  });

  it("lists empty, then creates a thread with a default title", async () => {
    await LocalFileStore.create("Threaded Platform", "custom");
    const { GET, POST } = await import("./route.js");

    const emptyResponse = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "threaded-platform" }),
    });
    expect(await emptyResponse.json()).toEqual([]);

    const createResponse = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }),
      { params: Promise.resolve({ slug: "threaded-platform" }) },
    );
    const created = await createResponse.json();
    expect(created.title).toBe("New thread");

    const listResponse = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "threaded-platform" }),
    });
    const listed = await listResponse.json();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
  });
});

describe("/api/runs/[slug]/threads/[threadId]", () => {
  it("renames and deletes a thread", async () => {
    const { store } = await LocalFileStore.create("Rename Platform", "custom");
    const thread = await store.createChatThread("Original");

    const { PATCH, DELETE } = await import("./[threadId]/route.js");

    const renameResponse = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "Renamed" }) }),
      { params: Promise.resolve({ slug: "rename-platform", threadId: thread.id }) },
    );
    expect(renameResponse.status).toBe(200);
    expect((await store.listChatThreads())[0]!.title).toBe("Renamed");

    const deleteResponse = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ slug: "rename-platform", threadId: thread.id }),
    });
    expect(deleteResponse.status).toBe(200);
    expect(await store.listChatThreads()).toEqual([]);
  });
});
