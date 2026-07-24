export interface CrawlEstimate {
  seedUrlCount: number;
  /** Total bytes across seed URLs that reported a Content-Length; undefined
   * entries (server didn't report one) aren't counted, so this is a floor,
   * not an exact total. */
  knownBytes: number;
  /** Rough token estimate from knownBytes (÷4, a common heuristic for
   * English prose; HTML markup overhead means the real number for actual
   * extracted content is usually lower, not higher). */
  estimatedTokens: number;
  maxDepth: number;
  maxPages: number;
}

/**
 * Cheap, non-blocking pre-flight for `scout understand`/the web "New" form:
 * HEAD-requests each seed doc URL (falling back to a byte-range GET if HEAD
 * isn't supported) to get a rough size before committing to a real crawl +
 * embed + synthesize run. Never throws on an individual URL failing; a size
 * estimate is a courtesy, not a precondition, so a slow or blocked doc page
 * just gets skipped from the total rather than aborting the estimate.
 */
export async function estimateCrawlCost(
  docUrls: string[],
  options: { maxDepth?: number; maxPages?: number } = {},
): Promise<CrawlEstimate> {
  let knownBytes = 0;

  await Promise.all(
    docUrls.map(async (url) => {
      try {
        let response = await fetch(url, { method: "HEAD" });
        if (!response.ok || !response.headers.get("content-length")) {
          response = await fetch(url, { headers: { Range: "bytes=0-0" } });
        }
        const length = Number(response.headers.get("content-length"));
        if (Number.isFinite(length) && length > 0) knownBytes += length;
      } catch {
        // Best-effort estimate; an unreachable URL here will surface as a
        // real error during the actual crawl instead.
      }
    }),
  );

  return {
    seedUrlCount: docUrls.length,
    knownBytes,
    estimatedTokens: Math.round(knownBytes / 4),
    maxDepth: options.maxDepth ?? 1,
    maxPages: options.maxPages ?? 20,
  };
}

export function formatCrawlEstimate(estimate: CrawlEstimate): string {
  const parts = [`${estimate.seedUrlCount} doc URL(s) provided`];
  if (estimate.knownBytes > 0) {
    const kb = Math.round(estimate.knownBytes / 1024);
    parts.push(`~${kb}KB / ~${estimate.estimatedTokens.toLocaleString()} tokens from those pages alone`);
  }
  if (estimate.maxDepth > 0) {
    parts.push(`crawl depth ${estimate.maxDepth} may follow same-site links up to ${estimate.maxPages} total pages`);
  }
  return `${parts.join(", ")}. Actual $ cost depends on your configured provider's pricing.`;
}
