import { NextResponse } from "next/server";
import { LocalFileStore, MultiRunThreadStore } from "@scout/store";

export interface UnifiedThreadSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** "single" threads live under one run's own LocalFileStore; "multi"
   * threads live in MultiRunThreadStore. The web UI needs this to know
   * which messages endpoint to call. */
  kind: "single" | "multi";
  platformSlugs: string[];
  platformNames: string[];
}

/**
 * Flattened view of every thread across every run, single- and multi-run
 * alike -- the Threads page no longer groups by run first, since a
 * multi-run thread doesn't belong under any one run's column.
 */
export async function GET() {
  const runs = await LocalFileStore.list();
  const nameBySlug = new Map(runs.map((r) => [r.slug, r.name]));

  const singleThreadLists = await Promise.all(
    runs.map(async (run): Promise<UnifiedThreadSummary[]> => {
      const opened = await LocalFileStore.open(run.slug);
      if (!opened) return [];
      const threads = await opened.store.listChatThreads();
      return threads.map((t) => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        kind: "single" as const,
        platformSlugs: [run.slug],
        platformNames: [run.name],
      }));
    }),
  );

  const multiThreads = await MultiRunThreadStore.list();
  const multiThreadSummaries: UnifiedThreadSummary[] = multiThreads.map((t) => ({
    id: t.id,
    title: t.title,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    kind: "multi",
    platformSlugs: t.platformSlugs,
    platformNames: t.platformSlugs.map((slug) => nameBySlug.get(slug) ?? slug),
  }));

  const merged = [...singleThreadLists.flat(), ...multiThreadSummaries].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  return NextResponse.json(merged);
}
