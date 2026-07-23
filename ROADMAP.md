# Roadmap

## Done

- Core pipeline: import (OpenAPI/Swagger URL or raw text), documentation crawling + chunking + embedding, understanding synthesis, grounded chat with citations.
- Local-first architecture: `packages/store`'s `LocalFileStore` persists everything under `~/.scout/runs/`, no database or server required for the default path.
- `scout` CLI: `understand`, `list`, `chat`, `export`, `watch`, `research`, `serve`, `connectors`, `config`.
- Local web viewer (`scout serve`), bound to `127.0.0.1`, no login, reading the same run directories live.
- Connectors as JSON config (`packages/connectors/registry/*.json` + `~/.scout/connectors/` overrides), not code.
- `scout watch`: polls doc URLs, hashes content, re-runs documentation + understanding agents on change, archives the previous snapshot to `history/`.
- `scout research`: related articles/tutorials/use cases via Tavily search, surfaced in the viewer and `scout export`.
- `scout mcp`: MCP server exposing `understand_platform` / `ask_platform` / `list_platforms` for Claude Code, Codex, Gemini CLI, and other MCP-speaking agents.
- Dormant hosted mode (`apps/api` + `apps/workers`, Fastify + Clerk + Postgres/pgvector + BullMQ/Redis) kept working but excluded from the default build/dev/test pipeline, for anyone who wants a multi-user hosted deployment later.

## Not yet implemented

- **npm publish**: `packages/cli` isn't published to npm yet (`npm install -g scoutcli` in the README is aspirational until then). The bundled connector JSON files and, longer term, a prebuilt local viewer need to ship inside the published package rather than assuming a monorepo checkout (`scout serve` currently spawns `apps/web`'s `next start` from a relative monorepo path).
- **More connectors**: 18 are declared in `packages/connectors/registry/`, only Contentful and Bynder have been run end-to-end. Adding one is now a JSON-only PR; see `CONTRIBUTING.md`.
- **More import kinds**: GraphQL introspection, GitHub repo spec discovery, Postman collections, HAR files. `packages/agents/import-agent.ts` only handles OpenAPI/Swagger URL and raw text today.
- **Local vector search upgrade path**: `packages/store`'s hybrid search is brute-force in-memory cosine similarity + keyword blend, fine at CLI/single-platform scale. `sqlite-vec` is a documented drop-in if chunk counts get large.
- **Recursive documentation crawling**: currently crawls exactly the URLs passed via `--docs`, no automatic link-following within a docs site.
- **Fresh screenshots**: the old web-app UI's screenshots are gone from the README since the CLI pivot; the local viewer and terminal output haven't been re-captured yet.
- **Fuller test coverage**: `packages/store`, `packages/cli`, and `packages/connectors` have unit tests for the core logic, but no end-to-end test harness beyond manual runs against real specs.

## Suggested build order for contributors

1. Pick an unimplemented connector from `packages/connectors/registry/`, run `scout understand` against its real spec + docs, and flip `implemented` to `true` once it works cleanly.
2. Add a new import kind to `packages/agents/import-agent.ts` (Postman collections are probably the easiest next one, same endpoint-shape output).
3. Publish `scoutcli` to npm (`packages/cli`), solving the "bundled data alongside a real npm install" problem for both the connector registry and, eventually, a prebuilt viewer.
