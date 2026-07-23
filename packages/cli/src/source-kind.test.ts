import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSourceKind } from "./source-kind.js";

describe("resolveSourceKind", () => {
  it("treats an http(s) URL as openapi_url", async () => {
    const result = await resolveSourceKind("https://example.com/openapi.json");
    expect(result).toEqual({ kind: "openapi_url", value: "https://example.com/openapi.json" });
  });

  it("respects an explicit --kind override even for a URL", async () => {
    const result = await resolveSourceKind("https://example.com/spec", "swagger_url");
    expect(result.kind).toBe("swagger_url");
  });

  describe("local file paths", () => {
    let tmpFile: string;

    beforeEach(async () => {
      tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "scout-cli-test-")), "spec.json");
      await fs.writeFile(tmpFile, '{"openapi":"3.0.0"}');
    });

    afterEach(async () => {
      await fs.rm(path.dirname(tmpFile), { recursive: true, force: true });
    });

    it("reads the file and treats it as openapi_raw", async () => {
      const result = await resolveSourceKind(tmpFile);
      expect(result.kind).toBe("openapi_raw");
      expect(result.value).toBe('{"openapi":"3.0.0"}');
    });
  });
});
