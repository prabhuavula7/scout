import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getConnector, loadConnectorRegistry } from "./registry.js";

describe("loadConnectorRegistry", () => {
  it("includes the bundled connectors, with contentful and bynder implemented", () => {
    const registry = loadConnectorRegistry();
    expect(registry.length).toBeGreaterThan(10);
    expect(getConnector("contentful")?.implemented).toBe(true);
    expect(getConnector("bynder")?.implemented).toBe(true);
    expect(getConnector("slack")?.implemented).toBe(false);
  });

  it("returns undefined for an unknown slug", () => {
    expect(getConnector("does-not-exist")).toBeUndefined();
  });

  describe("with a user override directory", () => {
    let tmpHome: string;

    beforeEach(() => {
      tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "scout-connectors-test-"));
      process.env.SCOUT_HOME = tmpHome;
      fs.mkdirSync(path.join(tmpHome, "connectors"), { recursive: true });
    });

    afterEach(() => {
      delete process.env.SCOUT_HOME;
      fs.rmSync(tmpHome, { recursive: true, force: true });
    });

    it("merges a new user-defined connector into the registry", () => {
      fs.writeFileSync(
        path.join(tmpHome, "connectors", "acme.json"),
        JSON.stringify({
          slug: "acme",
          name: "Acme",
          category: "crm",
          implemented: true,
          suggestedDocsUrl: null,
          defaultAuthScheme: "none",
          description: "A user-added connector.",
        }),
      );

      expect(getConnector("acme")?.name).toBe("Acme");
    });

    it("lets a user override a bundled connector by slug", () => {
      fs.writeFileSync(
        path.join(tmpHome, "connectors", "contentful.json"),
        JSON.stringify({
          slug: "contentful",
          name: "Contentful (custom)",
          category: "cms",
          implemented: true,
          suggestedDocsUrl: "https://example.com",
          defaultAuthScheme: "bearer_token",
          description: "Overridden.",
        }),
      );

      expect(getConnector("contentful")?.name).toBe("Contentful (custom)");
    });
  });
});
