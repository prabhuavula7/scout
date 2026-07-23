import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@integration-scout/db";
import { getLLMProvider } from "@integration-scout/ai";
import { runChatAgent } from "@integration-scout/agents";
import { ChatRequest } from "@integration-scout/types";

export async function chatRoutes(app: FastifyInstance) {
  const db = createDb();

  app.get("/platforms/:id/chat/messages", async (request) => {
    const { id } = request.params as { id: string };
    return db.select().from(schema.chatMessages).where(eq(schema.chatMessages.platformId, id));
  });

  app.post(
    "/chat",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = ChatRequest.parse(request.body);

      const [platform] = await db
        .select()
        .from(schema.platforms)
        .where(eq(schema.platforms.id, body.platformId));
      if (!platform) return reply.code(404).send({ error: "Platform not found" });

      await db.insert(schema.chatMessages).values({
        platformId: body.platformId,
        role: "user",
        content: body.message,
        citations: [],
      });

      const result = await runChatAgent(db, getLLMProvider(), body.platformId, body.message, body.history);

      const [saved] = await db
        .insert(schema.chatMessages)
        .values({
          platformId: body.platformId,
          role: "assistant",
          content: result.answer,
          citations: result.citations,
        })
        .returning();

      return saved;
    },
  );
}
