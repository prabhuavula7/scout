import { eq } from "drizzle-orm";
import type { Database } from "@integration-scout/db";
import { schema } from "@integration-scout/db";
import { getLLMProvider } from "@integration-scout/ai";
import type { ImportRequest } from "@integration-scout/types";
import { runAgent } from "./base.js";
import { runImportAgent } from "./import-agent.js";
import { runDocumentationAgent } from "./documentation-agent.js";
import { runUnderstandingAgent } from "./understanding-agent.js";

async function setStatus(db: Database, platformId: string, status: (typeof schema.platformStatusEnum.enumValues)[number]) {
  await db.update(schema.platforms).set({ status, updatedAt: new Date() }).where(eq(schema.platforms.id, platformId));
}

/**
 * Coordinator Agent: runs the full pipeline for a newly imported platform
 * (import spec -> persist endpoints -> crawl docs -> generate understanding),
 * advancing `platforms.status` at each stage so the UI can show real
 * progress instead of a spinner with no meaning.
 */
export async function runCoordinator(
  db: Database,
  platformId: string,
  request: ImportRequest,
  docUrls: string[],
): Promise<void> {
  const llm = getLLMProvider();

  try {
    await setStatus(db, platformId, "importing");
    const imported = await runAgent(db, platformId, "import", { request }, () =>
      runImportAgent(request),
    );

    await db
      .update(schema.platforms)
      .set({
        name: imported.name,
        baseUrl: imported.baseUrl,
        authScheme: imported.authScheme,
        rawSpec: imported.rawSpec,
        updatedAt: new Date(),
      })
      .where(eq(schema.platforms.id, platformId));

    if (imported.endpoints.length > 0) {
      await db.insert(schema.endpoints).values(
        imported.endpoints.map((e) => ({ ...e, platformId })),
      );
    }

    if (docUrls.length > 0) {
      await setStatus(db, platformId, "crawling_docs");
      await runAgent(db, platformId, "documentation", { docUrls }, () =>
        runDocumentationAgent(db, llm, platformId, docUrls),
      );
    }

    await setStatus(db, platformId, "embedding");
    const endpointSummaries = imported.endpoints.map(
      (e) => `${e.method} ${e.path}: ${e.summary ?? e.description ?? "no description"}`,
    );
    const docChunks = await db.query.docChunks.findMany({
      where: (chunks, { eq: eqOp }) => eqOp(chunks.platformId, platformId),
      limit: 40,
    });

    await runAgent(
      db,
      platformId,
      "understanding",
      { endpointCount: imported.endpoints.length, docChunkCount: docChunks.length },
      () =>
        runUnderstandingAgent(db, llm, platformId, {
          platformName: imported.name,
          endpointSummaries,
          docExcerpts: docChunks.map((c) => c.content),
        }),
    );

    await setStatus(db, platformId, "ready");
  } catch (error) {
    await setStatus(db, platformId, "failed");
    throw error;
  }
}
