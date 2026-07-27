import path from "node:path";
import { OfficeParser } from "officeparser";
import type { LLMProvider } from "@scout/ai";
import type { AgentStore } from "@scout/store";
import { chunkDocument, embedAndStoreChunks } from "@scout/rag";

/** Matches the size limit surfaced to the user for both uploaded files and
 * attached links: generous enough for a real runbook or PDF, small enough
 * to keep embedding cost/time predictable. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const HUMAN_LIMIT = `${MAX_UPLOAD_BYTES / 1_000_000} MB`;

// Formats officeparser natively parses into a structured AST we can render
// to markdown. Deliberately excludes zip archives (out of scope for v1) and
// excludes epub (no real use case here).
const OFFICEPARSER_EXTENSIONS = new Set(["docx", "xlsx", "pptx", "odt", "odp", "ods", "pdf", "rtf", "csv", "md", "html"]);
// No magic bytes to sniff, and no rich structure worth parsing -- read as-is.
const PLAIN_TEXT_EXTENSIONS = new Set(["txt", "json", "yaml", "yml", "log"]);

export const SUPPORTED_UPLOAD_EXTENSIONS = [...OFFICEPARSER_EXTENSIONS, ...PLAIN_TEXT_EXTENSIONS].sort();

function extensionOf(filename: string): string {
  const ext = path.extname(filename).slice(1).toLowerCase();
  return ext === "htm" ? "html" : ext;
}

/** officeparser's markdown renderer emits a leading YAML frontmatter block
 * (usually just a title, sometimes empty) and heading anchors like
 * "## Auth {#auth}" -- both editorial metadata that would otherwise become
 * a near-empty first chunk and slightly noisy section names. */
function cleanMarkdown(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n+/, "").replace(/\s*\{#[\w-]+\}/g, "");
}

async function extractMarkdown(filename: string, buffer: Buffer): Promise<string> {
  const ext = extensionOf(filename);
  if (OFFICEPARSER_EXTENSIONS.has(ext)) {
    const ast = await OfficeParser.parseOffice(buffer, { fileType: ext as never });
    const { value } = await ast.to("md");
    return typeof value === "string" ? cleanMarkdown(value) : "";
  }
  if (PLAIN_TEXT_EXTENSIONS.has(ext)) {
    return buffer.toString("utf-8");
  }
  throw new Error(
    `Unsupported file type "${ext ? `.${ext}` : filename}". Supported: ${SUPPORTED_UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(", ")}.`,
  );
}

const THIN_CONTENT_CHAR_THRESHOLD = 200;

function thinContentWarning(markdown: string): string | null {
  const length = markdown.trim().length;
  if (length === 0 || length >= THIN_CONTENT_CHAR_THRESHOLD) return null;
  return `Extracted content was only ${length} character(s) -- check this actually contains the material you expected.`;
}

export interface UploadDocsResult {
  chunksStored: number;
  sourceUrl: string;
  sourceTitle: string;
  /** Set when extraction succeeded but produced suspiciously little content,
   * not fatal -- the caller decides whether to surface it. */
  warning: string | null;
}

/**
 * Ingests a single uploaded file directly into a run's grounded doc corpus.
 * Reuses the exact same chunk/embed pipeline the documentation crawler uses
 * (chunkDocument -> embedAndStoreChunks), so a runbook, contract, or spec a
 * developer attaches is retrieved and cited identically to a crawled doc
 * page, just tagged with origin "upload" instead of "crawl".
 */
export async function runUploadFileAgent(
  store: AgentStore,
  llm: LLMProvider,
  platformId: string,
  input: { filename: string; buffer: Buffer },
): Promise<UploadDocsResult> {
  if (input.buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`"${input.filename}" is ${(input.buffer.byteLength / 1_000_000).toFixed(1)} MB, over the ${HUMAN_LIMIT} limit.`);
  }

  const markdown = await extractMarkdown(input.filename, input.buffer);
  if (markdown.trim().length === 0) {
    throw new Error(
      `Couldn't extract any text content from "${input.filename}". It may be empty, scanned/image-only, or corrupted.`,
    );
  }

  const sourceUrl = `scout-upload://${platformId}/${encodeURIComponent(input.filename)}`;
  const chunks = chunkDocument({ markdown, sourceUrl, sourceTitle: input.filename, origin: "upload" });
  const chunksStored = chunks.length > 0 ? await embedAndStoreChunks(store, llm, platformId, chunks) : 0;

  return { chunksStored, sourceUrl, sourceTitle: input.filename, warning: thinContentWarning(markdown) };
}

// A Drive share link's HTML is a viewer app shell, not the file's actual
// content -- fetching it would silently embed navigation chrome and call it
// "documentation." Refuse plainly instead of producing a garbage answer later.
const UNSUPPORTED_LINK_HOSTS = new Set(["drive.google.com", "docs.google.com"]);

const CONTENT_TYPE_TO_EXTENSION: Record<string, string> = {
  "application/pdf": "pdf",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "application/x-yaml": "yaml",
  "text/yaml": "yaml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/rtf": "rtf",
};

function extensionFromResponse(url: string, contentType: string): string {
  const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (CONTENT_TYPE_TO_EXTENSION[mime]) return CONTENT_TYPE_TO_EXTENSION[mime]!;
  const fromPath = extensionOf(new URL(url).pathname);
  if (OFFICEPARSER_EXTENSIONS.has(fromPath) || PLAIN_TEXT_EXTENSIONS.has(fromPath)) return fromPath;
  return "html"; // most links without a clear signal are articles/pages.
}

function extractHtmlTitle(buffer: Buffer): string | null {
  const match = buffer.toString("utf-8", 0, 8192).match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1]?.trim() || null;
}

/**
 * Ingests a single linked page or file the same way runUploadFileAgent
 * ingests an uploaded file: one fetch (no recursive crawling -- this is
 * supplementary context a user is deliberately attaching, not the
 * platform's own doc site), content-type detection, extract, chunk, embed.
 * The real URL becomes the chunk's sourceUrl, so citations for it are
 * clickable exactly like a crawled doc page's.
 */
export async function runUploadLinkAgent(
  store: AgentStore,
  llm: LLMProvider,
  platformId: string,
  input: { url: string },
): Promise<UploadDocsResult> {
  const parsed = new URL(input.url);
  if (UNSUPPORTED_LINK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "Google Drive links aren't supported yet -- a share link returns a viewer page, not the file itself. Download the file and upload it directly instead.",
    );
  }

  let response: Response;
  try {
    response = await fetch(input.url, { headers: { "User-Agent": "IntegrationScout/0.1 (+upload-link-agent)" } });
  } catch (error) {
    throw new Error(`Failed to fetch ${input.url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${input.url}: HTTP ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_UPLOAD_BYTES) {
    throw new Error(`${input.url} is over the ${HUMAN_LIMIT} limit.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`${input.url} is over the ${HUMAN_LIMIT} limit.`);
  }
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get("content-type") ?? "";
  const ext = extensionFromResponse(input.url, contentType);

  const markdown = await extractMarkdown(`link.${ext}`, buffer);
  if (markdown.trim().length === 0) {
    throw new Error(`Couldn't extract any text content from ${input.url}. It may be empty or require sign-in to view.`);
  }

  const sourceTitle = (ext === "html" ? extractHtmlTitle(buffer) : null) ?? `${parsed.hostname}${parsed.pathname}`;
  const chunks = chunkDocument({ markdown, sourceUrl: input.url, sourceTitle, origin: "link" });
  const chunksStored = chunks.length > 0 ? await embedAndStoreChunks(store, llm, platformId, chunks) : 0;

  return { chunksStored, sourceUrl: input.url, sourceTitle, warning: thinContentWarning(markdown) };
}
