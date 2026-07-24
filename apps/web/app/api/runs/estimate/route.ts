import { NextResponse } from "next/server";
import { z } from "zod";
import { estimateCrawlCost, formatCrawlEstimate } from "@scout/agents";

const EstimateBody = z.object({
  docUrls: z.array(z.string().url()).default([]),
  docsDepth: z.number().int().min(0).max(5).default(1),
  docsMaxPages: z.number().int().min(1).max(100).default(20),
});

export async function POST(request: Request) {
  const body = EstimateBody.parse(await request.json());
  if (body.docUrls.length === 0) {
    return NextResponse.json({ text: "No doc URLs to crawl; only the spec import + synthesis will run." });
  }
  const estimate = await estimateCrawlCost(body.docUrls, { maxDepth: body.docsDepth, maxPages: body.docsMaxPages });
  return NextResponse.json({ text: formatCrawlEstimate(estimate) });
}
