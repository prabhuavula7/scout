import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { LLMProvider } from "@integration-scout/ai";
import type { Database } from "@integration-scout/db";
import { chunkDocument, embedAndStoreChunks } from "@integration-scout/rag";
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

interface CrawledPage {
  url: string;
  title: string;
  markdown: string;
}

async function crawlPage(url: string): Promise<CrawledPage> {
  const response = await withRetry(() =>
    fetch(url, { headers: { "User-Agent": "IntegrationScout/0.1 (+documentation-agent)" } }),
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch docs page ${url}: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  STRIP_SELECTORS.forEach((selector) => $(selector).remove());

  const title = $("title").first().text().trim() || url;
  const main = $("main").first().length ? $("main").first() : $("body");
  const markdown = turndown.turndown(main.html() ?? "");

  return { url, title, markdown };
}

export interface DocumentationAgentResult {
  pagesCrawled: number;
  chunksStored: number;
}

/**
 * Documentation Agent: crawls a fixed set of documentation URLs (the
 * platform's docs entry point plus any additional pages supplied at import
 * time), converts them to clean markdown, chunks them semantically, embeds
 * each chunk, and persists it for retrieval. This intentionally does not
 * recursively spider an entire site; that's a job for a dedicated crawler
 * with rate limiting and scope rules, tracked in ROADMAP.md.
 */
export async function runDocumentationAgent(
  db: Database,
  llm: LLMProvider,
  platformId: string,
  urls: string[],
): Promise<DocumentationAgentResult> {
  let chunksStored = 0;
  let pagesCrawled = 0;

  for (const url of urls) {
    const page = await crawlPage(url);
    const chunks = chunkDocument({
      markdown: page.markdown,
      sourceUrl: page.url,
      sourceTitle: page.title,
    });
    if (chunks.length > 0) {
      chunksStored += await embedAndStoreChunks(db, llm, platformId, chunks);
    }
    pagesCrawled += 1;
  }

  return { pagesCrawled, chunksStored };
}
