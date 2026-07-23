import { z } from "zod";

export const ImportSourceKind = z.enum([
  "openapi_url",
  "openapi_raw",
  "swagger_url",
  "graphql_introspection",
  "github_repo",
  "docs_url",
  "postman_collection",
  "har",
]);
export type ImportSourceKind = z.infer<typeof ImportSourceKind>;

export const ImportRequest = z.object({
  /** Only meaningful in the dormant hosted mode (apps/api), where platforms belong to a project. */
  projectId: z.string().uuid().optional(),
  connectorSlug: z.string().min(1).optional(),
  kind: ImportSourceKind,
  value: z.string().min(1).describe("URL, raw spec text, or repo slug depending on kind"),
  label: z.string().min(1).max(120),
});
export type ImportRequest = z.infer<typeof ImportRequest>;

export const AuthScheme = z.enum([
  "api_key_header",
  "api_key_query",
  "bearer_token",
  "oauth2",
  "basic",
  "none",
]);
export type AuthScheme = z.infer<typeof AuthScheme>;

export const PlatformStatus = z.enum([
  "pending",
  "importing",
  "crawling_docs",
  "embedding",
  "ready",
  "failed",
]);
export type PlatformStatus = z.infer<typeof PlatformStatus>;

export const Platform = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  connectorSlug: z.string(),
  name: z.string(),
  baseUrl: z.string().url().nullable(),
  docsUrl: z.string().url().nullable(),
  authScheme: AuthScheme.nullable(),
  status: PlatformStatus,
  rawSpec: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Platform = z.infer<typeof Platform>;

export const EndpointParameter = z.object({
  name: z.string(),
  in: z.enum(["path", "query", "header", "body"]),
  required: z.boolean(),
  type: z.string(),
  description: z.string().nullable(),
});
export type EndpointParameter = z.infer<typeof EndpointParameter>;

export const Endpoint = z.object({
  id: z.string().uuid(),
  platformId: z.string().uuid(),
  group: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  parameters: z.array(EndpointParameter),
  requestBodySchema: z.record(z.string(), z.unknown()).nullable(),
  responseSchema: z.record(z.string(), z.unknown()).nullable(),
  exampleRequest: z.record(z.string(), z.unknown()).nullable(),
  exampleResponse: z.record(z.string(), z.unknown()).nullable(),
});
export type Endpoint = z.infer<typeof Endpoint>;
