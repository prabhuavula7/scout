import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  integer,
  pgEnum,
  customType,
  index,
} from "drizzle-orm/pg-core";

/**
 * pgvector column type. drizzle-orm has no first-class `vector` builder yet,
 * so we round-trip through the wire format pgvector expects: "[0.1,0.2,...]".
 */
const vector = (dimensions: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value: number[]): string {
      return `[${value.join(",")}]`;
    },
    fromDriver(value: string): number[] {
      return value
        .slice(1, -1)
        .split(",")
        .filter(Boolean)
        .map(Number);
    },
  });

// text-embedding-3-small: 1536 dimensions
export const EMBEDDING_DIMENSIONS = 1536;

export const importSourceKindEnum = pgEnum("import_source_kind", [
  "openapi_url",
  "openapi_raw",
  "swagger_url",
  "graphql_introspection",
  "github_repo",
  "docs_url",
  "postman_collection",
  "har",
]);

export const authSchemeEnum = pgEnum("auth_scheme", [
  "api_key_header",
  "api_key_query",
  "bearer_token",
  "oauth2",
  "basic",
  "none",
]);

export const platformStatusEnum = pgEnum("platform_status", [
  "pending",
  "importing",
  "crawling_docs",
  "embedding",
  "ready",
  "failed",
]);

export const agentNameEnum = pgEnum("agent_name", [
  "coordinator",
  "import",
  "documentation",
  "understanding",
  "chat",
]);

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const chatRoleEnum = pgEnum("chat_role", ["user", "assistant"]);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("projects_owner_id_idx").on(table.ownerId),
]);

export const platforms = pgTable("platforms", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  connectorSlug: text("connector_slug").notNull(),
  name: text("name").notNull(),
  baseUrl: text("base_url"),
  docsUrl: text("docs_url"),
  authScheme: authSchemeEnum("auth_scheme"),
  status: platformStatusEnum("status").notNull().default("pending"),
  rawSpec: jsonb("raw_spec").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("platforms_project_id_idx").on(table.projectId),
]);

export const endpoints = pgTable("endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
  group: text("group").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  summary: text("summary"),
  description: text("description"),
  parameters: jsonb("parameters").$type<unknown[]>().notNull().default([]),
  requestBodySchema: jsonb("request_body_schema").$type<Record<string, unknown> | null>(),
  responseSchema: jsonb("response_schema").$type<Record<string, unknown> | null>(),
  exampleRequest: jsonb("example_request").$type<Record<string, unknown> | null>(),
  exampleResponse: jsonb("example_response").$type<Record<string, unknown> | null>(),
}, (table) => [
  index("endpoints_platform_id_idx").on(table.platformId),
]);

export const docChunks = pgTable("doc_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<{
    sourceUrl: string;
    sourceTitle: string;
    section: string | null;
    topic: string;
  }>().notNull(),
  tokenCount: integer("token_count").notNull(),
  embedding: vector(EMBEDDING_DIMENSIONS)("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("doc_chunks_platform_id_idx").on(table.platformId),
]);

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<unknown[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("chat_messages_platform_id_idx").on(table.platformId),
]);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformId: uuid("platform_id").notNull().references(() => platforms.id, { onDelete: "cascade" }),
  agent: agentNameEnum("agent").notNull(),
  status: agentRunStatusEnum("status").notNull().default("queued"),
  input: jsonb("input").$type<Record<string, unknown>>().notNull(),
  output: jsonb("output").$type<Record<string, unknown> | null>(),
  error: text("error"),
  attempt: integer("attempt").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => [
  index("agent_runs_platform_id_idx").on(table.platformId),
]);

export const platformUnderstanding = pgTable("platform_understanding", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformId: uuid("platform_id").notNull().unique().references(() => platforms.id, { onDelete: "cascade" }),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});
