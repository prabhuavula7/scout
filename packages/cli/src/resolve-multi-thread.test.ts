import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MultiRunThreadStore } from "@scout/store";
import { resolveMultiThread } from "./resolve-multi-thread.js";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-resolve-multi-thread-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("resolveMultiThread", () => {
  it("creates a new thread when no match exists yet", async () => {
    const thread = await resolveMultiThread(["stripe", "hubspot"], "sync questions");
    expect(thread.title).toBe("sync questions");
    expect(thread.platformSlugs).toEqual(["stripe", "hubspot"]);
    expect(await MultiRunThreadStore.list()).toHaveLength(1);
  });

  it("reuses an existing thread with the same title and platform set, regardless of slug order", async () => {
    const created = await MultiRunThreadStore.create(["stripe", "hubspot"], "sync questions");
    const resolved = await resolveMultiThread(["hubspot", "stripe"], "sync questions");
    expect(resolved.id).toBe(created.id);
    expect(await MultiRunThreadStore.list()).toHaveLength(1);
  });

  it("creates a distinct thread when the title matches but the platform set doesn't", async () => {
    await MultiRunThreadStore.create(["stripe", "hubspot"], "sync questions");
    const resolved = await resolveMultiThread(["stripe", "github"], "sync questions");
    expect(resolved.platformSlugs).toEqual(["stripe", "github"]);
    expect(await MultiRunThreadStore.list()).toHaveLength(2);
  });

  it("creates a distinct thread when the platform set matches but the title doesn't", async () => {
    await MultiRunThreadStore.create(["stripe", "hubspot"], "sync questions");
    const resolved = await resolveMultiThread(["stripe", "hubspot"], "different name");
    expect(resolved.title).toBe("different name");
    expect(await MultiRunThreadStore.list()).toHaveLength(2);
  });
});
