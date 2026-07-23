# Integration Scout

**Understand any enterprise platform in minutes.**

![Integration Scout landing page](public/landing-page.png)

## What this is

Integration Scout is an AI-native tool that takes an unfamiliar enterprise
platform (an OpenAPI/Swagger spec plus its documentation) and produces, in
minutes, what normally takes an engineer days of manual reading: a
structured, cited integration blueprint. Architecture overview, auth flow,
data model, entity relationships, common workflows, pitfalls, security
observations, and a grounded chat assistant that answers follow-up questions
without inventing anything it wasn't given.

The pipeline is a set of cooperating agents, not one giant prompt:

```
Coordinator
  |- Import Agent          parses OpenAPI/Swagger into Platform + Endpoint[]
  |- Documentation Agent   crawls docs URLs into markdown, chunks, embeddings
  |- Understanding Agent   synthesizes the blueprint from endpoints + doc chunks
Chat Agent runs independently per message: embed query, hybrid search
(pgvector cosine + Postgres full-text), grounded completion with citations.
```

Every agent run is persisted to an audit table (status, input, output, error,
attempt), so the pipeline is inspectable, not a black box.

## Why it exists

Engineers who do integration work over and over, not once, spend a large
share of their time just getting oriented in a platform they've never touched
before: reading docs, guessing at auth, mapping out the data model by trial
and error. Integration Scout compresses that ramp-up into a few minutes so
the actual integration work can start sooner.

## Who it's for

Forward-deployed, solutions, and integration engineers who get handed a new
customer's tech stack (a CMS, a DAM, a CRM, a workflow tool) and need to
understand it well enough to build against it, usually under time pressure
and usually without a warm intro from that vendor's engineering team. Also
useful for anyone doing technical due diligence on a platform before
committing engineering time to it.

## Why OpenAPI/Swagger instead of just a URL

This is the most deliberate design decision in the system. A docs URL is
prose. Hand an LLM only prose and ask "what endpoints does this API have,"
and it will confidently invent plausible-sounding ones that don't exist:
wrong parameter names, wrong required fields, wrong auth schemes.

OpenAPI/Swagger is the platform's actual machine-readable contract: real
paths, methods, parameter types, request/response schemas, security schemes.
The **Import Agent parses that deterministically**, no LLM involved, just a
real parser, so every endpoint in the API Explorer is guaranteed real, not
inferred. The docs URL is the second input, used for a different job: it
supplies the human context a spec file doesn't have (rate limits, gotchas,
recommended workflows). The Understanding Agent then reasons over both:
structural ground truth from the spec, semantic context from the docs. That
split is what lets it cite real endpoints and explain real nuance without
fabricating either.

It also matches reality: most real platforms worth integrating with
(Contentful, GitHub, Stripe, HubSpot, Salesforce) publish an OpenAPI or
Swagger spec. Scraping endpoint definitions out of arbitrary docs-site HTML
instead would be far more fragile since every vendor structures their docs
site differently, while OpenAPI is a standard.

## Real-world use cases

- **New customer onboarding.** An engineer gets assigned a customer running
  an unfamiliar CMS. Instead of a day reading docs, they import it and get an
  instant, cited architecture and auth briefing.
- **Pre-integration planning.** Map out the data model and entity
  relationships before writing connector code, so the integration is
  architected correctly the first time instead of discovered mid-build.
- **Vendor evaluation.** Quickly assess a platform's auth complexity,
  pagination model, and rate limits before committing to integrate with it.
- **Knowledge handoff.** Point the next engineer at a platform's blueprint
  instead of relying on tribal knowledge.
- **Live Q&A while building.** Ask "how does pagination work here again?"
  mid-integration and get an answer grounded in the actual crawled docs, with
  a clickable citation to verify it.

This repo implements one connector (**Contentful**) end-to-end as a
first-class preset. See [ROADMAP.md](./ROADMAP.md) for what's deliberately
not built yet, and for why Bynder is next.

## Architecture

```
apps/
  web/         Next.js 15 App Router: workspace UI, Clerk auth
  api/         Fastify: REST API, Zod validation, Clerk token verification
  workers/     BullMQ worker: runs the import pipeline in the background
packages/
  types/       Shared Zod schemas (single source of truth for every shape)
  db/          Drizzle ORM schema (Postgres + pgvector), hybrid search
  ai/          Provider-agnostic LLM interface (OpenAI implementation)
  rag/         Chunking, embedding, citation formatting
  agents/      Import / Documentation / Understanding / Chat / Coordinator
  connectors/  Registry of target enterprise platforms
  ui/          Cross-cutting React primitives (StatusBadge, EmptyState, ThemeToggle)
  config/      Shared tsconfig + eslint config
```

## Walkthrough: importing a platform

The screenshots below are from a real run against GitHub's public REST API
(a large, genuinely public OpenAPI spec, imported by URL rather than pasted
directly, to exercise the fetch-and-parse path rather than a raw paste).

### 1. Start an import

Pick a connector preset (or leave it and fill in your own label), choose an
import source, and supply a spec plus a documentation URL to crawl.

![Import form filled out for GitHub's REST API](public/ProjectImportLink.png)

Two supported import sources:

- **OpenAPI / Swagger URL**: point at a real, publicly hosted spec. For
  example, GitHub's official spec lives in their own
  `github/rest-api-description` repository on GitHub and is fetched directly
  by URL.
- **Raw OpenAPI JSON or YAML**: paste a spec directly when there's no public
  URL to fetch (a partial spec reconstructed from prose docs, or one
  obtained under NDA from a vendor's support team).

While the import runs, the platform status badge cycles through pending,
importing, crawling docs, embedding, and finally ready, so progress is
visible rather than a spinner with no meaning.

### 2. Browse the parsed API

Every endpoint below comes directly from the parsed spec: real methods,
paths, and summaries, grouped by tag, with generated cURL/TypeScript/Python
code samples per endpoint.

![API Explorer showing parsed GitHub endpoints grouped by tag](public/APIExplorer.png)

### 3. Read the generated understanding

The Understanding Agent synthesizes a full blueprint from the parsed
endpoints plus whatever was crawled from the docs URL. It starts with a
summary and architecture overview.

![Understanding tab: summary and architecture overview](public/Understanding1.png)

It includes a generated entity relationship diagram and a breakdown of
common workflows, both derived from the actual endpoint set, not invented.

![Entity relationships diagram and common workflows](public/Understanding2.png)

It also proposes concrete integration opportunities based on what the API
can actually do.

![Integration opportunities section](public/Understanding3.png)

Where the provided material doesn't cover something (auth header formats,
pagination semantics, rate limit behavior), the agent says so explicitly in
a **Missing documentation** section rather than guessing.

![Missing documentation section listing real gaps in the source material](public/understandnig4.png)

It closes with security observations: which endpoints are high-impact,
which need strong operational controls, and where authentication actually
matters.

![Security observations section](public/understanding5.png)

A generated sequence diagram shows a realistic multi-step flow through the
API (in this case, a GitHub App bootstrapping an installation access token
and listing accessible repositories).

![Generated sequence diagram for a GitHub App installation flow](public/SequenceDiagram.png)

### 4. Ask the grounded chat assistant

Every answer is retrieved via hybrid search (pgvector cosine similarity
blended with Postgres full-text search) over the same chunks the
Understanding Agent used, and every answer must cite its sources inline.

![AI Chat answering a question about GitHub workflows, with inline citations](public/AI-RAGChat.png)

## Tutorial: two real end-to-end examples

Both of these are real runs, not fixtures. Bring your own OpenAI API key.

### Example A: Contentful, via a hand-authored raw spec

Useful when there's no single public spec URL to point at, or to test the
`openapi_raw` import path.

1. Connector preset: `Contentful` (auto-fills the label and a real docs URL).
2. Import source: `Raw OpenAPI JSON or YAML`.
3. Paste a small spec covering real, documented Contentful Content Delivery
   API endpoints (entries, assets, content types), with a `bearerAuth`
   security scheme.
4. Docs URL: leave the pre-filled `https://www.contentful.com/developers/docs/`.
5. Submit, watch the status reach ready, then check API Explorer,
   Understanding, and AI Chat.

### Example B: GitHub's REST API, via a real public spec URL

Useful for testing the `openapi_url` fetch-and-parse path against a large,
real, actively maintained spec.

1. Connector preset: any (GitHub isn't a built-in preset yet, so just
   overwrite the label).
2. Import source: `OpenAPI / Swagger URL`.
3. URL: `https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json`
4. Label: `GitHub`.
5. Docs URL: `https://docs.github.com/en/rest`.
6. Submit. This spec is large (thousands of endpoints), so import takes
   noticeably longer than a small hand-authored one, but the Understanding
   Agent only ever looks at the first 150 endpoint summaries and 40 doc
   excerpts regardless of total size, so the LLM call itself stays bounded.

### Where to find a real spec for any other platform

1. Check the platform's own developer docs for an "OpenAPI spec," "Swagger,"
   or "API Reference" link, often in the docs footer or sidebar.
2. Try common conventions directly: `https://api.example.com/openapi.json`,
   `/swagger.json`, or a `developer.` subdomain equivalent.
3. If their docs page renders via Swagger UI, Redoc, Stoplight, or
   ReadMe.io, the spec JSON/YAML is being fetched from a public URL visible
   in the browser's network tab or page source.
4. [APIs.guru](https://apis.guru) catalogs thousands of publicly known
   OpenAPI specs for real companies.
5. Many companies publish their spec in a public GitHub repository, as
   GitHub itself does.
6. If none of that turns up anything, use `Raw OpenAPI JSON or YAML` and
   hand-author a partial spec from the prose docs instead.

## Local development

**Prerequisites**: Node 22+, pnpm 10+, Docker.

```bash
git clone <this-repo-url>
cd IntegrationScout

cp .env.example .env
# fill in OPENAI_API_KEY at minimum; Clerk keys optional (falls back to a
# single dev user locally if CLERK_SECRET_KEY is unset)

pnpm install
pnpm docker:up            # Postgres (pgvector) + Redis
pnpm db:generate          # generate migrations from packages/db/src/schema.ts
pnpm db:migrate

pnpm dev                  # runs web (:3000), api (:4000), workers in parallel
```

Then open http://localhost:3000, create a project, and import a platform
using either example above.

### Verifying the codebase without Docker

```bash
pnpm typecheck   # strict TS across all 10 packages
pnpm lint        # eslint across api/web/workers
pnpm test        # vitest: chunking, citations, OpenAPI parsing, code generators
```

These don't require Postgres/Redis; they cover the pure logic (chunking,
citation building, OpenAPI parsing, cURL/TS/Python generation). The live
pipeline (import, crawl, embed, chat) needs `pnpm docker:up` and
`pnpm db:migrate` first.

## Deploying

- `apps/web` deploys to Vercel as-is (`vercel.json` not required; standard
  Next.js detection).
- `apps/api` and `apps/workers` need a persistent Node host (they hold
  long-lived Postgres/Redis connections and a BullMQ worker loop). Railway,
  Fly.io, or a Vercel background function setup all work; point
  `NEXT_PUBLIC_API_URL` at wherever `apps/api` ends up.
- Swap local Postgres/Redis for hosted equivalents (Supabase, Upstash) by
  changing `DATABASE_URL`/`REDIS_URL`; no code changes required.

## Why these choices

- **Provider-agnostic LLM layer** (`packages/ai`): every agent depends on
  the `LLMProvider` interface, not the OpenAI SDK directly. Adding Claude,
  Gemini, or OpenRouter is one adapter file plus an `AI_PROVIDER` env value.
- **Hybrid retrieval** (`packages/db/src/vector-search.ts`): pure vector
  search misses exact keyword matches like error codes or field names,
  so it's blended with Postgres full-text search without a second database.
- **Citations are structural, not prompted**: the chat agent builds its
  citation list from the exact chunks it retrieved and passed to the model.
  It can't cite a source it wasn't given.
