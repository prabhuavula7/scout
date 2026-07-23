import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { connectorsOverrideDir } from "@scout/store";

export type ConnectorCategory =
  | "cms"
  | "dam"
  | "workflow"
  | "knowledge"
  | "storage"
  | "crm"
  | "communication";

export interface ConnectorDefinition {
  slug: string;
  name: string;
  category: ConnectorCategory;
  /** Whether the generic OpenAPI/docs pipeline has been verified end-to-end against this platform. */
  implemented: boolean;
  /** Suggested docs entry point to speed up the import flow. Left null when we're not confident of a stable URL. */
  suggestedDocsUrl: string | null;
  defaultAuthScheme: "api_key_header" | "bearer_token" | "oauth2" | "basic" | "none";
  description: string;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Two candidate locations for the bundled registry: running from source
// (packages/connectors/src/registry.ts -> ../registry) or from a bundled CLI
// build, where this module gets inlined into dist/index.js and the JSON
// files are copied alongside it into dist/registry (see cli/tsup.config.ts).
const BUNDLED_REGISTRY_CANDIDATES = [
  path.join(moduleDir, "..", "registry"),
  path.join(moduleDir, "registry"),
];

function readConnectorFiles(dir: string): ConnectorDefinition[] {
  let entries: string[];
  try {
    entries = readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  return entries.map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf-8")) as ConnectorDefinition);
}

function readBundledConnectors(): ConnectorDefinition[] {
  for (const dir of BUNDLED_REGISTRY_CANDIDATES) {
    const found = readConnectorFiles(dir);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * Connectors are config, not code: adding a platform is a JSON file, not a
 * source change. Bundled connectors ship in packages/connectors/registry/
 * (committed to the repo, e.g. Contentful, Bynder); anyone can add their own
 * or override a bundled one via `~/.scout/connectors/*.json` (same shape,
 * see `scout connectors add`), which takes precedence by slug.
 */
export function loadConnectorRegistry(): ConnectorDefinition[] {
  const bundled = readBundledConnectors();
  const userDefined = readConnectorFiles(connectorsOverrideDir());

  const bySlug = new Map<string, ConnectorDefinition>();
  for (const connector of bundled) bySlug.set(connector.slug, connector);
  for (const connector of userDefined) bySlug.set(connector.slug, connector);

  return [...bySlug.values()];
}

export function getConnector(slug: string): ConnectorDefinition | undefined {
  return loadConnectorRegistry().find((c) => c.slug === slug);
}
