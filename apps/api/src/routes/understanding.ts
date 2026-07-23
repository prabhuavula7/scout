import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createDb, schema } from "@integration-scout/db";

export async function understandingRoutes(app: FastifyInstance) {
  const db = createDb();

  app.get("/platforms/:id/understanding", async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const [row] = await db
      .select()
      .from(schema.platformUnderstanding)
      .where(eq(schema.platformUnderstanding.platformId, id));
    if (!row) {
      return reply.code(404).send({ error: "Understanding not generated yet for this platform" });
    }
    return row.data;
  });
}
