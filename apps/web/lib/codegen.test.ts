import { describe, expect, it } from "vitest";
import type { Endpoint } from "@scout/types";
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
    const curl = generateCurl(ENDPOINT, "https://api.example.com", "bearer_token");
    expect(curl).toContain("https://api.example.com/entries/:id/publish");
    expect(curl).toContain('-H "X-Environment: <X-Environment>"');
    expect(curl).toContain(`-d '{\n  "version": 1\n}'`);
  });

  it("generates a fetch-based TypeScript sample with the request body", () => {
    const ts = generateTypeScript(ENDPOINT, "https://api.example.com", "bearer_token");
    expect(ts).toContain('method: "POST"');
    expect(ts).toContain("/entries/:id/publish");
    expect(ts).toContain('"version": 1');
  });

  it("generates a requests-based Python sample using the lowercased method", () => {
    const python = generatePython(ENDPOINT, "https://api.example.com", "bearer_token");
    expect(python).toContain("requests.post(");
    expect(python).toContain("json={");
  });

  it("omits the body for GET requests", () => {
    const getEndpoint: Endpoint = { ...ENDPOINT, method: "GET", requestBodySchema: null };
    expect(generateTypeScript(getEndpoint, "https://api.example.com", "bearer_token")).not.toContain("body:");
    expect(generatePython(getEndpoint, "https://api.example.com", "bearer_token")).not.toContain("json=");
  });

  describe("auth scheme fidelity (not fabricated)", () => {
    it("uses a Bearer header only when the run's real auth scheme is bearer_token", () => {
      const ts = generateTypeScript(ENDPOINT, "https://api.example.com", "bearer_token");
      expect(ts).toContain("Authorization");
      expect(ts).toContain("Bearer");
    });

    it("uses an X-API-Key header, not Bearer, for api_key_header", () => {
      const ts = generateTypeScript(ENDPOINT, "https://api.example.com", "api_key_header");
      expect(ts).toContain("X-API-Key");
      expect(ts).not.toContain("Authorization");
      expect(ts).not.toContain("Bearer");
    });

    it("appends the key as a query param, with no auth header, for api_key_query", () => {
      const curl = generateCurl(ENDPOINT, "https://api.example.com", "api_key_query");
      expect(curl).toContain("?api_key=$API_TOKEN");
      expect(curl).not.toContain("Authorization");

      const python = generatePython(ENDPOINT, "https://api.example.com", "api_key_query");
      expect(python).toContain("?api_key=$API_TOKEN");
      expect(python).not.toContain("headers=");
    });

    it("does not fabricate any auth header for oauth2, basic, none, or an unset scheme", () => {
      for (const scheme of ["oauth2", "basic", "none", null] as const) {
        const ts = generateTypeScript(ENDPOINT, "https://api.example.com", scheme);
        expect(ts).not.toContain("Authorization");
        expect(ts).not.toContain("Bearer");
        expect(ts).not.toContain("X-API-Key");
        expect(ts).toContain("doesn't have a safe default");

        const curl = generateCurl(ENDPOINT, "https://api.example.com", scheme);
        expect(curl).not.toContain("Authorization");
        expect(curl).toContain("doesn't have a safe default");
      }
    });

    it("defaults to the honest no-auth-header path when no scheme is passed at all", () => {
      const ts = generateTypeScript(ENDPOINT, "https://api.example.com");
      expect(ts).not.toContain("Authorization");
      expect(ts).not.toContain("Bearer");
    });
  });
});
