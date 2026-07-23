import { parse as parseYaml } from "yaml";
import type { AuthScheme, Endpoint, EndpointParameter, ImportRequest } from "@integration-scout/types";
import { withRetry } from "./base.js";

interface OpenAPIOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<{
    name: string;
    in: string;
    required?: boolean;
    schema?: { type?: string };
    description?: string;
  }>;
  requestBody?: {
    content?: Record<string, { schema?: unknown; example?: unknown }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: unknown; example?: unknown }> }>;
}

interface OpenAPIDocument {
  info?: { title?: string };
  servers?: Array<{ url: string }>;
  paths?: Record<string, Record<string, OpenAPIOperation>>;
  components?: {
    securitySchemes?: Record<string, { type: string; scheme?: string; in?: string }>;
  };
}

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export interface ImportResult {
  name: string;
  baseUrl: string | null;
  authScheme: AuthScheme;
  rawSpec: Record<string, unknown>;
  endpoints: Omit<Endpoint, "id" | "platformId">[];
}

function detectAuthScheme(doc: OpenAPIDocument): AuthScheme {
  const schemes = Object.values(doc.components?.securitySchemes ?? {});
  const first = schemes[0];
  if (!first) return "none";
  if (first.type === "http" && first.scheme === "bearer") return "bearer_token";
  if (first.type === "http" && first.scheme === "basic") return "basic";
  if (first.type === "oauth2") return "oauth2";
  if (first.type === "apiKey" && first.in === "header") return "api_key_header";
  if (first.type === "apiKey" && first.in === "query") return "api_key_query";
  return "none";
}

function extractEndpoints(doc: OpenAPIDocument): Omit<Endpoint, "id" | "platformId">[] {
  const endpoints: Omit<Endpoint, "id" | "platformId">[] = [];

  for (const [path, operations] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = operations[method];
      if (!operation) continue;

      const parameters: EndpointParameter[] = (operation.parameters ?? []).map((p) => ({
        name: p.name,
        in: (p.in as EndpointParameter["in"]) ?? "query",
        required: p.required ?? false,
        type: p.schema?.type ?? "string",
        description: p.description ?? null,
      }));

      const requestBodySchema =
        operation.requestBody?.content?.["application/json"]?.schema ?? null;
      const successResponse =
        operation.responses?.["200"] ?? operation.responses?.["201"] ?? undefined;
      const responseSchema = successResponse?.content?.["application/json"]?.schema ?? null;

      endpoints.push({
        group: operation.tags?.[0] ?? "General",
        method: method.toUpperCase() as Endpoint["method"],
        path,
        summary: operation.summary ?? null,
        description: operation.description ?? null,
        parameters,
        requestBodySchema: requestBodySchema as Record<string, unknown> | null,
        responseSchema: responseSchema as Record<string, unknown> | null,
        exampleRequest:
          (operation.requestBody?.content?.["application/json"]?.example as
            | Record<string, unknown>
            | undefined) ?? null,
        exampleResponse:
          (successResponse?.content?.["application/json"]?.example as
            | Record<string, unknown>
            | undefined) ?? null,
      });
    }
  }

  return endpoints;
}

function parseSpecText(text: string): OpenAPIDocument {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as OpenAPIDocument;
  }
  return parseYaml(trimmed) as OpenAPIDocument;
}

/**
 * Import Agent: turns a raw OpenAPI/Swagger source (URL or pasted text)
 * into a normalized Platform + Endpoint[] pair. GraphQL introspection,
 * Postman collections, and HAR files share the same output shape but need
 * their own extractors (tracked in ROADMAP.md, not faked here).
 */
export async function runImportAgent(request: ImportRequest): Promise<ImportResult> {
  let specText: string;

  switch (request.kind) {
    case "openapi_raw":
      specText = request.value;
      break;
    case "openapi_url":
    case "swagger_url": {
      const response = await withRetry(() => fetch(request.value));
      if (!response.ok) {
        throw new Error(`Failed to fetch spec from ${request.value}: HTTP ${response.status}`);
      }
      specText = await response.text();
      break;
    }
    default:
      throw new Error(
        `Import kind "${request.kind}" is not implemented yet. Supported now: openapi_url, openapi_raw, swagger_url. See ROADMAP.md.`,
      );
  }

  const doc = parseSpecText(specText);
  const endpoints = extractEndpoints(doc);

  return {
    name: doc.info?.title ?? request.label,
    baseUrl: doc.servers?.[0]?.url ?? null,
    authScheme: detectAuthScheme(doc),
    rawSpec: doc as Record<string, unknown>,
    endpoints,
  };
}
