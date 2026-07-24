import { NextResponse } from "next/server";
import { z } from "zod";
import { runRefresh } from "@scout/agents";
import { LocalFileStore } from "@scout/store";
import { resolveLLMProvider } from "@/lib/server-config";

const RefreshBody = z.object({
  mode: z.enum(["resynthesize", "recrawl"]).default("resynthesize"),
  docsDepth: z.number().int().min(0).max(5).optional(),
  docsMaxPages: z.number().int().min(1).max(200).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opened = await LocalFileStore.open(slug);
  if (!opened) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const { store, platformId } = opened;

  const body = RefreshBody.parse(await request.json().catch(() => ({})));
  const platform = await store.getPlatform();
  const docUrls = platform.docUrls ?? [];

  const crawlOptions = {
    maxDepth: body.docsDepth ?? platform.crawlOptions?.maxDepth ?? 2,
    maxPages: body.docsMaxPages ?? platform.crawlOptions?.maxPages ?? 50,
  };
  if (body.mode === "recrawl") await store.setCrawlOptions(crawlOptions.maxDepth, crawlOptions.maxPages);

  // Same fire-and-poll pattern as run creation: this can take a while
  // (recrawl mode refetches every doc URL), so don't hold the request open.
  resolveLLMProvider()
    .then((llm) => runRefresh(store, platformId, llm, docUrls, body.mode, crawlOptions))
    .catch((error) => {
      console.error(`Background refresh for "${slug}" failed:`, error);
    });

  return NextResponse.json({ ok: true }, { status: 202 });
}
