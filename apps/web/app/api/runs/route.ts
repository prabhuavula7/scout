import { NextResponse } from "next/server";
import { z } from "zod";
import { runCoordinator } from "@scout/agents";
import { getConnector } from "@scout/connectors";
import { LocalFileStore } from "@scout/store";
import type { ImportRequest } from "@scout/types";
import { resolveLLMProvider } from "@/lib/server-config";

export async function GET() {
  const runs = await LocalFileStore.list();
  return NextResponse.json(runs);
}

const CreateRunBody = z.object({
  source: z.string().min(1),
  kind: z.enum(["openapi_url", "openapi_raw"]),
  docUrls: z.array(z.string().url()).default([]),
  label: z.string().min(1).max(120).optional(),
  connectorSlug: z.string().optional(),
  docsDepth: z.number().int().min(0).max(5).default(2),
  docsMaxPages: z.number().int().min(1).max(200).default(50),
});

export async function POST(request: Request) {
  const body = CreateRunBody.parse(await request.json());

  const connector = body.connectorSlug ? getConnector(body.connectorSlug) : undefined;
  if (body.connectorSlug && !connector) {
    return NextResponse.json({ error: `Unknown connector "${body.connectorSlug}"` }, { status: 400 });
  }

  const label = body.label ?? connector?.name ?? "platform";
  const docUrls = body.docUrls.length > 0 ? body.docUrls : connector?.suggestedDocsUrl ? [connector.suggestedDocsUrl] : [];

  const importRequest: ImportRequest = {
    connectorSlug: connector?.slug,
    kind: body.kind,
    value: body.source,
    label,
  };

  const { store, platformId } = await LocalFileStore.create(label, connector?.slug ?? "custom");
  await store.setDocUrls(docUrls);

  const crawlOptions = { maxDepth: body.docsDepth, maxPages: body.docsMaxPages };
  await store.setCrawlOptions(crawlOptions.maxDepth, crawlOptions.maxPages);

  // Fire-and-poll: `scout serve` is a long-running local process (unlike a
  // serverless function that freezes after the response), so it's safe to
  // kick off the pipeline without awaiting it here and let the client poll
  // the run's status (already live via useRuns' refetchInterval) instead of
  // holding the request open for a multi-minute crawl + embed + synthesize.
  resolveLLMProvider()
    .then((llm) => runCoordinator(store, platformId, importRequest, docUrls, llm, crawlOptions))
    .catch((error) => {
      console.error(`Background understand run for "${store.slug}" failed:`, error);
    });

  return NextResponse.json({ slug: store.slug }, { status: 202 });
}
