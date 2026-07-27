import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalFileStore, MultiRunThreadStore } from "@scout/store";

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "scout-web-unified-threads-test-"));
  process.env.SCOUT_HOME = tmpHome;
});

afterEach(async () => {
  delete process.env.SCOUT_HOME;
  await fs.rm(tmpHome, { recursive: true, force: true });
});

describe("GET /api/threads", () => {
  it("returns an empty list when there are no runs or threads", async () => {
    const { GET } = await import("./route.js");
    expect(await (await GET()).json()).toEqual([]);
  });

  it("merges single-run threads and multi-run threads into one flat, updated-desc list", async () => {
    const { store: stripe } = await LocalFileStore.create("Stripe", "custom");
    await LocalFileStore.create("HubSpot", "custom");
    const singleThread = await stripe.createChatThread("Stripe questions");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const multiThread = await MultiRunThreadStore.create(["stripe", "hubspot"], "Cross-platform");

    const { GET } = await import("./route.js");
    const listed = await (await GET()).json();

    expect(listed).toHaveLength(2);
    expect(listed[0].id).toBe(multiThread.id); // most recently updated first
    expect(listed[0].kind).toBe("multi");
    expect(listed[0].platformSlugs).toEqual(["stripe", "hubspot"]);
    expect(listed[0].platformNames).toEqual(["Stripe", "HubSpot"]);

    expect(listed[1].id).toBe(singleThread.id);
    expect(listed[1].kind).toBe("single");
    expect(listed[1].platformSlugs).toEqual(["stripe"]);
    expect(listed[1].platformNames).toEqual(["Stripe"]);
  });
});
