import { MultiRunThreadStore, type MultiRunThreadRecord } from "@scout/store";

/** Resolves a --thread <name> option to a multi-run thread grounded in
 * exactly these platform slugs: an exact title + platform-set match reuses
 * that thread, otherwise a new one is created. Unlike resolveThread's
 * single-run "Main" default, there's no natural default thread for an
 * arbitrary set of platforms that may never have been paired before, so
 * callers must always supply a name for a multi-platform conversation. */
export async function resolveMultiThread(platformSlugs: string[], name: string): Promise<MultiRunThreadRecord> {
  const sorted = [...platformSlugs].sort();
  const threads = await MultiRunThreadStore.list();
  const existing = threads.find(
    (t) => t.title === name && [...t.platformSlugs].sort().join(",") === sorted.join(","),
  );
  if (existing) return existing;
  return MultiRunThreadStore.create(platformSlugs, name);
}
