import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createClerkClient } from "@clerk/backend";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
  }
}

const DEV_USER_ID = "dev-local-user";

/**
 * Verifies the Clerk session token on every request and attaches `userId`.
 * When CLERK_SECRET_KEY is not configured (fresh clone, keys not added yet)
 * we fall back to a single fixed dev user so the app is still runnable
 * end-to-end locally. This is explicitly logged, never silent.
 */
export default fp(async function authPlugin(app: FastifyInstance) {
  if (!env.CLERK_SECRET_KEY) {
    app.log.warn(
      "CLERK_SECRET_KEY is not set. Running with an unauthenticated dev user. Set it in .env for real auth.",
    );
    app.addHook("preHandler", async (request: FastifyRequest) => {
      request.userId = DEV_USER_ID;
    });
    return;
  }

  const clerkClient = createClerkClient(
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
      ? { secretKey: env.CLERK_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }
      : { secretKey: env.CLERK_SECRET_KEY },
  );

  app.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith("/health")) return;

    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(", "));
    }

    const authResult = await clerkClient.authenticateRequest(
      new Request(`http://internal${request.url}`, { headers }),
    );

    if (!authResult.isSignedIn) {
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const userId = authResult.toAuth().userId;
    if (!userId) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
    request.userId = userId;
  });
});
