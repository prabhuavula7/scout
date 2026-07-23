import { describe, expect, it } from "vitest";
import type { Endpoint } from "@integration-scout/types";
import { generateCurl, generatePython, generateTypeScript } from "./codegen";

const ENDPOINT: Endpoint = {
  id: "1",
  platformId: "p1",
  group: "Entries",
  method: "POST",
  path: "/entries/{id}/publish",
  summary: "Publish an entry",
  description: null,
  parameters: [
    { name: "id", in: "path", required: true, type: "string", description: null },
    { name: "X-Environment", in: "header", required: false, type: "string", description: null },
  ],
  requestBodySchema: { type: "object" },
  responseSchema: null,
  exampleRequest: { version: 1 },
  exampleResponse: null,
};

describe("codegen", () => {
  it("substitutes path parameters and includes headers in the curl sample", () => {
    const curl = generateCurl(ENDPOINT, "https://api.example.com");
    expect(curl).toContain("https://api.example.com/entries/:id/publish");
    expect(curl).toContain('-H "X-Environment: <X-Environment>"');
    expect(curl).toContain(`-d '{\n  "version": 1\n}'`);
  });

  it("generates a fetch-based TypeScript sample with the request body", () => {
    const ts = generateTypeScript(ENDPOINT, "https://api.example.com");
    expect(ts).toContain('method: "POST"');
    expect(ts).toContain("/entries/:id/publish");
    expect(ts).toContain('"version": 1');
  });

  it("generates a requests-based Python sample using the lowercased method", () => {
    const python = generatePython(ENDPOINT, "https://api.example.com");
    expect(python).toContain("requests.post(");
    expect(python).toContain("json={");
  });

  it("omits the body for GET requests", () => {
    const getEndpoint: Endpoint = { ...ENDPOINT, method: "GET", requestBodySchema: null };
    expect(generateTypeScript(getEndpoint, "https://api.example.com")).not.toContain("body:");
    expect(generatePython(getEndpoint, "https://api.example.com")).not.toContain("json=");
  });
});
