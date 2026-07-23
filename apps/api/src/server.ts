import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import authPlugin from "./plugins/auth.js";
import { projectRoutes } from "./routes/projects.js";
import { platformRoutes } from "./routes/platforms.js";
import { understandingRoutes } from "./routes/understanding.js";
import { chatRoutes } from "./routes/chat.js";

const app = Fastify({
  logger:
    env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty" } }
      : true,
});

await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
// Global default. Routes that call OpenAI (chat, import) set a stricter
// per-route limit below, since those are the ones with a real cost per
// request, not just a load-protection concern.
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(authPlugin);

app.get("/health", async () => ({ status: "ok" }));

await app.register(projectRoutes, { prefix: "/api" });
await app.register(platformRoutes, { prefix: "/api" });
await app.register(understandingRoutes, { prefix: "/api" });
await app.register(chatRoutes, { prefix: "/api" });

app.setErrorHandler((error: FastifyError, _request, reply) => {
  app.log.error(error);
  if (error.validation) {
    return reply.code(400).send({ error: "Validation failed", details: error.validation });
  }
  return reply.code(error.statusCode ?? 500).send({ error: error.message });
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
