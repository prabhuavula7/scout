import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MultiRunThreadStore } from "./multi-thread-store.js";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-multi-thread-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("MultiRunThreadStore", () => {
  it("creates a thread and lists it back with its platform slugs", async () => {
    const created = await MultiRunThreadStore.create(["stripe", "hubspot"], "Cross-platform sync");
    const listed = await MultiRunThreadStore.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: created.id, title: "Cross-platform sync", platformSlugs: ["stripe", "hubspot"] });
  });

  it("defaults to 'New thread' when no title is given", async () => {
    const created = await MultiRunThreadStore.create(["stripe", "github"]);
    expect(created.title).toBe("New thread");
  });

  it("lists threads most-recently-updated first", async () => {
    const first = await MultiRunThreadStore.create(["a", "b"], "First");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await MultiRunThreadStore.create(["a", "b"], "Second");

    const listed = await MultiRunThreadStore.list();
    expect(listed[0]!.id).toBe(second.id);
    expect(listed[1]!.id).toBe(first.id);
  });

  it("renames a thread", async () => {
    const created = await MultiRunThreadStore.create(["stripe", "hubspot"], "Original");
    await MultiRunThreadStore.rename(created.id, "Renamed");
    const fetched = await MultiRunThreadStore.get(created.id);
    expect(fetched?.title).toBe("Renamed");
  });

  it("removes a thread entirely", async () => {
    const created = await MultiRunThreadStore.create(["stripe", "hubspot"]);
    await MultiRunThreadStore.remove(created.id);
    expect(await MultiRunThreadStore.get(created.id)).toBeNull();
    expect(await MultiRunThreadStore.list()).toEqual([]);
  });

  it("appends messages, returns them in order, and bumps updatedAt on the thread", async () => {
    const created = await MultiRunThreadStore.create(["stripe", "hubspot"]);
    await MultiRunThreadStore.appendMessage(created.id, "user", "How do these two talk to each other?", []);
    await MultiRunThreadStore.appendMessage(created.id, "assistant", "Via webhooks on both sides.", [
      { type: "docs", ref: "https://docs.stripe.com/webhooks", title: "Webhooks" },
    ]);

    const history = await MultiRunThreadStore.getHistory(created.id);
    expect(history).toHaveLength(2);
    expect(history[0]!.role).toBe("user");
    expect(history[1]!.citations).toEqual([{ type: "docs", ref: "https://docs.stripe.com/webhooks", title: "Webhooks" }]);

    const updated = await MultiRunThreadStore.get(created.id);
    expect(updated!.updatedAt >= created.updatedAt).toBe(true);
  });

  it("getHistory returns an empty array for a thread with no messages yet", async () => {
    const created = await MultiRunThreadStore.create(["stripe", "hubspot"]);
    expect(await MultiRunThreadStore.getHistory(created.id)).toEqual([]);
  });
});
