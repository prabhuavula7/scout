# apps/api (dormant hosted mode)

Scout's default distribution is the `scout` CLI plus its local viewer (`scout serve`) — no server, no auth, no database to run. This app and its sibling `apps/workers` are not part of that default path.

They're kept in the repo, working and untouched, as an optional future hosted/multi-user mode: a Fastify API with Clerk auth, rate limiting, and a BullMQ worker backed by Postgres/pgvector + Redis. Nothing in the CLI, the viewer, or CI depends on this code.

If you want to run it anyway:

```
pnpm hosted:docker:up      # postgres + redis, see docker-compose.yml in this directory
pnpm hosted:db:migrate
pnpm hosted:dev            # runs apps/api and apps/workers
```

It needs its own `.env` (`DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `OPENAI_API_KEY`) — see `.env.example` in the repo root for the full historical set of hosted-mode variables.
