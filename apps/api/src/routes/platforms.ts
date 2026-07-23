import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "@integration-scout/db";
import { ImportRequest } from "@integration-scout/types";
import { CONNECTOR_REGISTRY } from "@integration-scout/connectors";
import { importQueue } from "../queue.js";

export async function platformRoutes(app: FastifyInstance) {
  const db = createDb();

  app.get("/connectors", async () => CONNECTOR_REGISTRY);

  app.get("/projects/:projectId/platforms", async (request, reply) => {
    const { projectId } = z.object({ projectId: z.string().uuid() }).parse(request.params);
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, projectId), eq(schema.projects.ownerId, request.userId)));
    if (!project) return reply.code(404).send({ error: "Project not found" });

    return db.select().from(schema.platforms).where(eq(schema.platforms.projectId, projectId));
  });

  const ImportBody = ImportRequest.omit({ projectId: true }).extend({
    docUrls: z.array(z.string().url()).max(10).default([]),
  });

  app.post(
    "/projects/:projectId/platforms/import",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { projectId } = z.object({ projectId: z.string().uuid() }).parse(request.params);
      const [project] = await db
        .select()
        .from(schema.projects)
        .where(and(eq(schema.projects.id, projectId), eq(schema.projects.ownerId, request.userId)));
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const body = ImportBody.parse(request.body);
      const importRequest = ImportRequest.parse({ ...body, projectId });

      const [platform] = await db
        .insert(schema.platforms)
        .values({
          projectId,
          connectorSlug: body.connectorSlug ?? "custom",
          name: body.label,
          status: "pending",
        })
        .returning();

      await importQueue.add("run-import-pipeline", {
        platformId: platform!.id,
        request: importRequest,
        docUrls: body.docUrls,
      });

      reply.code(202);
      return platform;
    },
  );

  app.get("/platforms/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const [platform] = await db.select().from(schema.platforms).where(eq(schema.platforms.id, id));
    if (!platform) return reply.code(404).send({ error: "Platform not found" });
    return platform;
  });

  app.get("/platforms/:id/endpoints", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const [platform] = await db.select().from(schema.platforms).where(eq(schema.platforms.id, id));
    if (!platform) return reply.code(404).send({ error: "Platform not found" });
    return db.select().from(schema.endpoints).where(eq(schema.endpoints.platformId, id));
  });

  app.get("/platforms/:id/agent-runs", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const [platform] = await db.select().from(schema.platforms).where(eq(schema.platforms.id, id));
    if (!platform) return reply.code(404).send({ error: "Platform not found" });
    return db.select().from(schema.agentRuns).where(eq(schema.agentRuns.platformId, id));
  });
}
