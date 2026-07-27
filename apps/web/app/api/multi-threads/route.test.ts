import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-multi-threads-route-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

function postRequest(body: unknown) {
  return new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
}

describe("/api/multi-threads", () => {
  it("lists empty, then creates a thread spanning multiple platforms", async () => {
    const { GET, POST } = await import("./route.js");

    expect(await (await GET()).json()).toEqual([]);

    const createResponse = await POST(postRequest({ platformSlugs: ["stripe", "hubspot"], title: "Cross-platform sync" }));
    expect(createResponse.status).toBe(200);
    const created = await createResponse.json();
    expect(created.title).toBe("Cross-platform sync");
    expect(created.platformSlugs).toEqual(["stripe", "hubspot"]);

    const listed = await (await GET()).json();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
  });

  it("400s when fewer than two platform slugs are given", async () => {
    const { POST } = await import("./route.js");
    const response = await POST(postRequest({ platformSlugs: ["stripe"] }));
    expect(response.status).toBe(400);
  });
});

describe("/api/multi-threads/[threadId]", () => {
  it("renames and deletes a multi-run thread", async () => {
    const { MultiRunThreadStore } = await import("@scout/store");
    const thread = await MultiRunThreadStore.create(["stripe", "hubspot"], "Original");

    const { PATCH, DELETE } = await import("./[threadId]/route.js");

    const renameResponse = await PATCH(
      new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ title: "Renamed" }) }),
      { params: Promise.resolve({ threadId: thread.id }) },
    );
    expect(renameResponse.status).toBe(200);
    expect((await MultiRunThreadStore.get(thread.id))?.title).toBe("Renamed");

    const deleteResponse = await DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ threadId: thread.id }),
    });
    expect(deleteResponse.status).toBe(200);
    expect(await MultiRunThreadStore.get(thread.id)).toBeNull();
  });
});
