import { encode } from "gpt-tokenizer";
import type { DocChunkMetadata } from "@scout/types";

export interface ChunkInput {
  markdown: string;
  sourceUrl: string;
  sourceTitle: string;
  /** Defaults to "crawl" (the original --docs crawler's use of this function). */
  origin?: DocChunkMetadata["origin"];
}

export interface Chunk {
  content: string;
  metadata: DocChunkMetadata;
  tokenCount: number;
}

const MAX_TOKENS = 500;
const OVERLAP_TOKENS = 60;

const TOPIC_KEYWORDS: Array<[DocChunkMetadata["topic"], RegExp]> = [
  ["authentication", /\b(auth|api key|oauth|bearer token|access token|credential)/i],
  ["rate_limits", /\b(rate limit|throttl|requests per|429)/i],
  ["pagination", /\b(pagination|page size|cursor|next page|offset|limit=)/i],
  ["webhooks", /\bwebhook/i],
  ["errors", /\b(error code|4\d{2}|5\d{2}|exception|failure mode)/i],
  ["sdks", /\b(sdk|client library|npm install|pip install)/i],
  ["versioning", /\b(version|v1|v2|deprecat|changelog)/i],
  ["best_practices", /\b(best practice|recommend|should|avoid)/i],
  ["objects", /\b(object|resource|entity|schema|model)\b/i],
  ["endpoints", /\b(endpoint|GET |POST |PUT |DELETE |PATCH )/],
];

function inferTopic(text: string): DocChunkMetadata["topic"] {
  for (const [topic, pattern] of TOPIC_KEYWORDS) {
    if (pattern.test(text)) return topic;
  }
  return "general";
}

function splitIntoSections(markdown: string): Array<{ heading: string | null; body: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ heading: string | null; body: string[] }> = [
    { heading: null, body: [] },
  ];

  for (const line of lines) {
    const headingMatch = /^(#{2,4})\s+(.*)/.exec(line);
    if (headingMatch) {
      sections.push({ heading: headingMatch[2]?.trim() ?? null, body: [] });
    } else {
      sections[sections.length - 1]?.body.push(line);
    }
  }

  return sections
    .map((s) => ({ heading: s.heading, body: s.body.join("\n").trim() }))
    .filter((s) => s.body.length > 0);
}

/** Splits a single paragraph that alone exceeds the token budget, on sentence boundaries. */
function splitOversizedParagraph(paragraph: string, maxTokens: number): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = encode(sentence).length;
    if (currentTokens + sentenceTokens > maxTokens && current.length > 0) {
      pieces.push(current.join(" "));
      current = [];
      currentTokens = 0;
    }
    current.push(sentence);
    currentTokens += sentenceTokens;
  }
  if (current.length > 0) pieces.push(current.join(" "));
  return pieces;
}

function splitByTokenBudget(text: string, maxTokens: number, overlapTokens: number): string[] {
  const rawParagraphs = text.split(/\n{2,}/).filter(Boolean);
  const paragraphs = rawParagraphs.flatMap((paragraph) =>
    encode(paragraph).length > maxTokens
      ? splitOversizedParagraph(paragraph, maxTokens)
      : [paragraph],
  );

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const paragraphTokens = encode(paragraph).length;

    if (currentTokens + paragraphTokens > maxTokens && current.length > 0) {
      chunks.push(current.join("\n\n"));
      const overlapText = current[current.length - 1] ?? "";
      const overlapCount = encode(overlapText).length;
      current = overlapCount <= overlapTokens ? [overlapText] : [];
      currentTokens = overlapCount <= overlapTokens ? overlapCount : 0;
    }

    current.push(paragraph);
    currentTokens += paragraphTokens;
  }

  if (current.length > 0) chunks.push(current.join("\n\n"));
  return chunks;
}

/**
 * Splits crawled documentation into semantically coherent, token-bounded
 * chunks tagged with a topic label, ready for embedding.
 */
export function chunkDocument({ markdown, sourceUrl, sourceTitle, origin = "crawl" }: ChunkInput): Chunk[] {
  const sections = splitIntoSections(markdown);
  const chunks: Chunk[] = [];

  for (const section of sections) {
    const pieces = splitByTokenBudget(section.body, MAX_TOKENS, OVERLAP_TOKENS);
    for (const piece of pieces) {
      const withHeading = section.heading ? `## ${section.heading}\n\n${piece}` : piece;
      chunks.push({
        content: withHeading,
        tokenCount: encode(withHeading).length,
        metadata: {
          sourceUrl,
          sourceTitle,
          section: section.heading,
          topic: inferTopic(withHeading),
          origin,
        },
      });
    }
  }

  return chunks;
}
