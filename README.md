# Scout

[![CI](https://github.com/prabhuavula7/scout/actions/workflows/ci.yml/badge.svg)](https://github.com/prabhuavula7/scout/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Understand any enterprise platform in minutes.**

Point Scout at a platform's OpenAPI/Swagger spec and its docs, and it produces a cited integration blueprint (architecture, auth flow, data model, common workflows, pitfalls) plus a grounded chat assistant, all running locally on your machine. No account, no server, no hosting.

```
npm install -g scoutcli   # once published; see "Local development" until then

scout understand https://petstore3.swagger.io/api/v3/openapi.json --docs https://example.com/docs
scout chat petstore-openapi-3-0
scout serve
```

## What this is

A CLI (`scout`) and a small local web viewer (`scout serve`) built on the same core: an agent pipeline that imports an OpenAPI/Swagger spec, crawls the docs you point it at, chunks and embeds them, and asks an LLM to synthesize a grounded, citation-backed understanding of the platform, not a guess from the model's training data. Everything is stored under `~/.scout/runs/`, so a run from a month ago and one from five minutes ago show up identically.

## Why it exists

Every integration engineer has opened an unfamiliar platform's docs and spent the first hour just building a mental model: what's the auth flow, what are the core entities, what breaks in practice. Scout automates that first hour. It's the tool a Forward Deployed Engineer, a solutions architect, or anyone shipping a new integration would reach for before writing the first line of code.

## Who it's for

Engineers who integrate with third-party platforms regularly, not just once. It's designed to be run repeatedly: `scout watch` keeps a platform's understanding current as its docs change, and every run is kept, so you can come back to a platform you looked at last quarter and see what changed.

## Why OpenAPI/Swagger instead of just a URL

A bare docs URL is prose; an OpenAPI spec is a machine-readable contract, endpoints, parameters, schemas, auth scheme, all structured. Scout uses the spec as ground truth for what the API can actually do, and the crawled docs as ground truth for how it's meant to be used, prose and endpoint contract cross-checked against each other rather than trusting either alone. That's also why the Understanding Agent is instructed to say "missing documentation" instead of inventing an endpoint or field that isn't evidenced in what was actually provided.

## Real-world use cases

- Evaluating a new vendor's API before a build/buy decision.
- Onboarding onto a platform your team just adopted, without reading the entire docs site cover to cover.
- Keeping a living understanding of a platform your team integrates with, refreshed automatically as its docs change (`scout watch`).
- Feeding a coding agent (Claude Code, Codex, Gemini CLI) real, cited platform knowledge mid-session via `scout mcp`, instead of it guessing from training data.

## Core commands

| Command | What it does |
|---|---|
| `scout understand <spec-url-or-path>` | Run the full pipeline: import spec, crawl `--docs`, generate the understanding. |
| `scout list` | List every run, most recently updated first. |
| `scout chat <slug>` | Terminal chat REPL, grounded in the crawled docs, with citations. |
| `scout export <slug> --format md\|json` | Export the understanding (and any research results) as Markdown or JSON. |
| `scout watch <slug>` | Poll the run's doc URLs, re-run the pipeline automatically when they change. |
| `scout research <slug>` | Find related articles, tutorials, and use cases via Tavily search. |
| `scout serve` | Start the local web viewer at `127.0.0.1`, no login. |
| `scout connectors list` / `add <file>` | List or add connector presets (see "Adding a connector" below). |
| `scout config set <key> <value>` | Persist an API key/model override to `~/.scout/config.json`. |
| `scout mcp` | Run Scout as an MCP server (stdio) for Claude Code, Codex, Gemini CLI, etc. |

## Architecture

```
packages/agents       import / documentation / understanding / chat / research agents
packages/ai           provider-agnostic LLM interface (OpenAI implementation)
packages/rag          chunking + citation formatting
packages/store        AgentStore contract + LocalFileStore (the CLI's default persistence)
packages/connectors    connector presets as JSON (bundled + user-added)
packages/cli           the `scout` binary
apps/web               the local viewer (Next.js), served by `scout serve`
```

The agent pipeline (`packages/agents`) doesn't know or care where its data is persisted; it depends on an `AgentStore` interface. `LocalFileStore` (in `packages/store`) is the default implementation: one directory per run under `~/.scout/runs/<slug>/`, flat JSON files for the current snapshot, append-only JSONL for chat and audit logs, and a `history/` folder of prior understanding snapshots whenever `scout watch` detects a doc change. Hybrid search (embedding cosine similarity blended with keyword relevance) runs in-memory, no database required.

`apps/api` and `apps/workers` (Fastify + Clerk auth + Postgres/pgvector + BullMQ/Redis) implement the same `AgentStore` contract over Postgres. They're kept in the repo, working, but dormant: not part of the default build/dev/test pipeline, for anyone who wants a hosted multi-user mode later. See `apps/api/README.md`.

## Adding a connector

A connector is a JSON file, not code:

```json
{
  "slug": "acme",
  "name": "Acme",
  "category": "crm",
  "implemented": true,
  "suggestedDocsUrl": "https://developers.acme.com/",
  "defaultAuthScheme": "bearer_token",
  "description": "Acme's CRM API."
}
```

Bundled connectors live in `packages/connectors/registry/*.json`; `scout connectors add <file>` drops your own into `~/.scout/connectors/`, which overrides a bundled one by slug or adds a new one. `implemented: true` means someone has actually run `scout understand` against it successfully, since the import path itself is generic (any valid OpenAPI/Swagger spec works regardless of connector). See `CONTRIBUTING.md` for the full recipe if you want to contribute one upstream.

## Local development

```
pnpm install
pnpm build           # builds everything except the dormant hosted mode
pnpm --filter scoutcli dev -- understand <spec-url>   # run the CLI from source via tsx
pnpm --filter scoutcli build && node packages/cli/dist/index.js serve
```

`pnpm typecheck` / `pnpm lint` / `pnpm test` cover the default (CLI + viewer) path; `pnpm hosted:build` / `pnpm hosted:dev` cover the dormant hosted mode.

## License

MIT, see [LICENSE](LICENSE).
