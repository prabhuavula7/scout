import fs from "node:fs/promises";
import type { ImportSourceKind } from "@scout/types";

/**
 * The CLI accepts a URL or a local file path for the spec argument and
 * infers which ImportRequest.kind to use; an explicit --kind flag always wins.
 */
export async function resolveSourceKind(
  source: string,
  explicitKind?: string,
): Promise<{ kind: ImportSourceKind; value: string }> {
  if (explicitKind) return { kind: explicitKind as ImportSourceKind, value: source };
  if (/^https?:\/\//i.test(source)) return { kind: "openapi_url", value: source };
  const raw = await fs.readFile(source, "utf-8");
  return { kind: "openapi_raw", value: raw };
}
