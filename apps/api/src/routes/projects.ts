import type { FastifyInstance } from "fastify";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "@integration-scout/db";
import { CreateProjectRequest, UpdateProjectRequest } from "@integration-scout/types";

export async function projectRoutes(app: FastifyInstance) {
  const db = createDb();

  app.get("/projects", async (request) => {
    return db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.ownerId, request.userId))
      .orderBy(desc(schema.projects.updatedAt));
  });

  app.post("/projects", async (request, reply) => {
    const body = CreateProjectRequest.parse(request.body);
    const [project] = await db
      .insert(schema.projects)
      .values({ ownerId: request.userId, name: body.name, description: body.description ?? null })
      .returning();
    reply.code(201);
    return project;
  });

  app.get("/projects/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const [project] = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, request.userId)));
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return project;
  });

  app.patch("/projects/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = UpdateProjectRequest.parse(request.body);
    const [project] = await db
      .update(schema.projects)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, request.userId)))
      .returning();
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return project;
  });

  app.delete("/projects/:id", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const [project] = await db
      .delete(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, request.userId)))
      .returning();
    if (!project) return reply.code(404).send({ error: "Project not found" });
    reply.code(204);
    return null;
  });

  app.patch("/projects/:id/favorite", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const { isFavorite } = z.object({ isFavorite: z.boolean() }).parse(request.body);
    const [project] = await db
      .update(schema.projects)
      .set({ isFavorite, updatedAt: new Date() })
      .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, request.userId)))
      .returning();
    if (!project) return reply.code(404).send({ error: "Project not found" });
    return project;
  });
}
