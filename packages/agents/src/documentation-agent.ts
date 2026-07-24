import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { LLMProvider } from "@scout/ai";
import type { AgentStore } from "@scout/store";
import { chunkDocument, embedAndStoreChunks } from "@scout/rag";
import { withRetry } from "./base.js";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

// Common chrome that isn't documentation content.
const STRIP_SELECTORS = [
  "nav",
  "header",
  "footer",
  "script",
  "style",
  "noscript",
  "[role='navigation']",
  ".sidebar",
  ".site-header",
  ".site-footer",
  ".cookie-banner",
];

/** Below this many characters of extracted markdown, a page is treated as
 * "thin": either genuinely sparse, or (commonly) a JS-rendered SPA shell
 * cheerio's static HTML fetch can't execute, so the real content never
 * shows up in the response body at all. Heuristic, not exact. */
const THIN_PAGE_CHAR_THRESHOLD = 500;

interface CrawledPage {
  url: string;
  title: string;
  markdown: string;
  links: string[];
}

function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.toString();
}

/** Same-origin links found anywhere on the page (nav/sidebar included,
 * since that's usually where a docs site enumerates its other pages) —
 * collected before STRIP_SELECTORS removes that chrome for content
 * extraction, so link discovery and content extraction see different
 * slices of the same document. */
function extractSameOriginLinks($: cheerio.CheerioAPI, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === origin && (resolved.protocol === "http:" || resolved.protocol === "https:")) {
        links.add(normalizeUrl(resolved.toString()));
      }
    } catch {
      // Not a parseable absolute/relative URL (mailto:, javascript:, etc); skip.
    }
  });
  return [...links];
}

async function crawlPage(url: string): Promise<CrawledPage> {
  let response: Response;
  try {
    response = await withRetry(() =>
      fetch(url, { headers: { "User-Agent": "IntegrationScout/0.1 (+documentation-agent)" } }),
    );
  } catch (error) {
    // A DNS failure, connection refused, timeout, etc. throws before there's
    // any HTTP response to check .ok on; without this, the error surfaced
    // to the user is Node's bare "fetch failed" with no indication of which
    // of possibly several --docs URLs was the problem.
    throw new Error(`Failed to fetch docs page ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch docs page ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const links = extractSameOriginLinks($, url);

  STRIP_SELECTORS.forEach((selector) => $(selector).remove());

  const title = $("title").first().text().trim() || url;
  const main = $("main").first().length ? $("main").first() : $("body");
  const markdown = turndown.turndown(main.html() ?? "");

  return { url, title, markdown, links };
}

export interface CrawlOptions {
  /** How many hops of same-origin links to follow from the seed URLs.
   * 0 crawls exactly the given URLs, matching the old fixed-set behavior. */
  maxDepth?: number;
  /** Hard cap on total pages fetched, seeds included, regardless of depth;
   * the safety net against a recursive crawl spidering an entire site
   * (and the LLM/embedding cost that would come with it). */
  maxPages?: number;
}

const DEFAULT_CRAWL_OPTIONS: Required<CrawlOptions> = { maxDepth: 1, maxPages: 20 };

export interface DocumentationAgentResult {
  pagesCrawled: number;
  chunksStored: number;
  /** URLs whose crawled content came back suspiciously short, most often
   * because the page is JS-rendered and cheerio only ever sees the initial
   * HTML shell. Surfaced to the caller so it can warn instead of silently
   * grounding answers in near-nothing. */
  thinPages: string[];
  /** URLs that failed to fetch at all (404, DNS failure, timeout, etc),
   * with the reason. A single bad page, especially one only discovered via
   * recursive crawling rather than given directly by the user, shouldn't
   * abort an otherwise-successful crawl of every other page; see the
   * per-page try/catch below. */
  failedPages: Array<{ url: string; error: string }>;
}

/**
 * Documentation Agent: crawls the given documentation URLs (the platform's
 * docs entry point plus any additional pages supplied at import time),
 * converts them to clean markdown, chunks them semantically, embeds each
 * chunk, and persists it for retrieval. Optionally follows same-origin
 * links a bounded number of hops past the seed URLs (see CrawlOptions),
 * capped by maxPages regardless of depth so this stays a scoped crawl of
 * a docs site, not an open-ended spider.
 */
export async function runDocumentationAgent(
  store: AgentStore,
  llm: LLMProvider,
  platformId: string,
  urls: string[],
  options: CrawlOptions = {},
): Promise<DocumentationAgentResult> {
  const { maxDepth, maxPages } = { ...DEFAULT_CRAWL_OPTIONS, ...options };

  let chunksStored = 0;
  const thinPages: string[] = [];
  const failedPages: Array<{ url: string; error: string }> = [];
  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = urls.map((url) => ({ url: normalizeUrl(url), depth: 0 }));

  while (queue.length > 0 && visited.size < maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    let page: CrawledPage;
    try {
      page = await crawlPage(url);
    } catch (error) {
      // One dead page, especially a link only discovered by following the
      // site's own nav (not something the user typed in), shouldn't sink
      // an otherwise-successful crawl of every other page. Skip it, record
      // why, keep going.
      failedPages.push({ url, error: error instanceof Error ? error.message : String(error) });
      continue;
    }

    const chunks = chunkDocument({
      markdown: page.markdown,
      sourceUrl: page.url,
      sourceTitle: page.title,
    });
    if (chunks.length > 0) {
      chunksStored += await embedAndStoreChunks(store, llm, platformId, chunks);
    }
    if (page.markdown.trim().length < THIN_PAGE_CHAR_THRESHOLD) {
      thinPages.push(page.url);
    }

    if (depth < maxDepth) {
      for (const link of page.links) {
        if (!visited.has(link)) queue.push({ url: link, depth: depth + 1 });
      }
    }
  }

  return { pagesCrawled: visited.size, chunksStored, thinPages, failedPages };
}
