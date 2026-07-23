import { describe, expect, it } from "vitest";
import { runImportAgent } from "./import-agent.js";

const SAMPLE_SPEC = {
  info: { title: "Sample CMS API" },
  servers: [{ url: "https://api.example.com/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer" },
    },
  },
  paths: {
    "/entries/{id}": {
      get: {
        tags: ["Entries"],
        summary: "Get an entry",
        description: "Fetch a single content entry by ID.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "locale", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            content: { "application/json": { schema: { type: "object" }, example: { id: "abc" } } },
          },
        },
      },
      delete: {
        tags: ["Entries"],
        summary: "Delete an entry",
        responses: { "200": {} },
      },
    },
    "/entries": {
      post: {
        tags: ["Entries"],
        summary: "Create an entry",
        requestBody: {
          content: {
            "application/json": { schema: { type: "object" }, example: { title: "Hello" } },
          },
        },
        responses: { "201": {} },
      },
    },
  },
};

describe("runImportAgent", () => {
  it("parses a raw JSON OpenAPI spec into endpoints", async () => {
    const result = await runImportAgent({
      projectId: "11111111-1111-1111-1111-111111111111",
      kind: "openapi_raw",
      value: JSON.stringify(SAMPLE_SPEC),
      label: "Sample",
    });

    expect(result.name).toBe("Sample CMS API");
    expect(result.baseUrl).toBe("https://api.example.com/v1");
    expect(result.authScheme).toBe("bearer_token");
    expect(result.endpoints).toHaveLength(3);

    const getEntry = result.endpoints.find((e) => e.method === "GET");
    expect(getEntry?.path).toBe("/entries/{id}");
    expect(getEntry?.parameters).toHaveLength(2);
    expect(getEntry?.parameters[0]).toMatchObject({ name: "id", in: "path", required: true });

    const postEntry = result.endpoints.find((e) => e.method === "POST");
    expect(postEntry?.exampleRequest).toEqual({ title: "Hello" });
  });

  it("parses a raw YAML OpenAPI spec identically to JSON", async () => {
    const yaml = `
info:
  title: Sample CMS API
paths:
  /entries:
    get:
      tags: [Entries]
      summary: List entries
      responses:
        "200": {}
`;
    const result = await runImportAgent({
      projectId: "11111111-1111-1111-1111-111111111111",
      kind: "openapi_raw",
      value: yaml,
      label: "Sample",
    });

    expect(result.name).toBe("Sample CMS API");
    expect(result.endpoints).toHaveLength(1);
    expect(result.endpoints[0]!.group).toBe("Entries");
  });

  it("rejects unimplemented import kinds with a clear error", async () => {
    await expect(
      runImportAgent({
        projectId: "11111111-1111-1111-1111-111111111111",
        kind: "har",
        value: "{}",
        label: "Sample",
      }),
    ).rejects.toThrow(/not implemented/i);
  });
});
