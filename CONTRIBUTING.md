# Contributing

## Setup

```
pnpm install
pnpm build
```

`pnpm typecheck`, `pnpm lint`, and `pnpm test` all run against the default (CLI + local viewer) path. The dormant hosted mode (`apps/api`, `apps/workers`) has its own `pnpm hosted:*` scripts; see `apps/api/README.md` if you're working on that instead.

To run the CLI from source while developing:

```
pnpm --filter scoutcli dev -- understand <spec-url> --docs <docs-url>
pnpm --filter scoutcli dev -- serve
```

Prefer not to install Node/pnpm locally at all? `docker compose up` builds and runs Scout from source; see the README's "Run with Docker" section. Useful for a quick sanity check that a change didn't break the packaged build, since it goes through the same `pnpm build` + npm-dependency-resolution path `npm publish` would.

## Adding a connector

This is the easiest, highest-value contribution. A connector is a JSON file, no code:

1. Copy the shape from any file in `packages/connectors/registry/*.json`:

   ```json
   {
     "slug": "acme",
     "name": "Acme",
     "category": "cms",
     "implemented": false,
     "suggestedDocsUrl": "https://developers.acme.com/",
     "defaultAuthScheme": "bearer_token",
     "description": "One sentence describing what the platform is."
   }
   ```

   `category` is one of `cms`, `dam`, `workflow`, `knowledge`, `storage`, `crm`, `communication`. `defaultAuthScheme` is one of `api_key_header`, `api_key_query`, `bearer_token`, `oauth2`, `basic`, `none`.

2. Find the platform's real OpenAPI/Swagger spec and a docs page worth crawling, and actually run it:

   ```
   scout understand <real-spec-url> --docs <real-docs-url> --label "Acme"
   ```

3. If it produces a real, non-hallucinated understanding (check the summary and data model against the platform's actual docs), set `"implemented": true` and open a PR adding your JSON file to `packages/connectors/registry/`. If the spec was messy or the pipeline choked on something, that's useful too, open an issue describing what broke; `implemented: false` connectors are still valuable as a declared target list.

You can also add or override a connector locally without a PR: `scout connectors add <your-file.json>` writes it to `~/.scout/connectors/`, which takes precedence over the bundled set by slug.

## Adding an LLM or search provider

Both are adapter interfaces, same shape as adding a new import kind:

- **LLM**: implement `LLMProvider` (`packages/ai/src/provider.ts`: `complete`, `completeStructured`, `streamComplete`, `embed`) in a new file under `packages/ai/src/providers/`, wire it into `buildProviderFromEntry` in `packages/ai/src/factory.ts`, and add the kind to `LLMProviderKind` in `packages/types/src/config.ts`. If the backend speaks the OpenAI chat-completions wire protocol (most self-hosted/local model servers do, and most hosted aggregators too), you likely don't need a new adapter at all, existing `openai-compatible` entries already cover this via a custom `--base-url`.
- **Search**: implement `SearchProvider` (`packages/agents/src/search/provider.ts`: one `search(query, maxResults)` method) under `packages/agents/src/search/`, wire it into `buildSearchProviderFromEntry` in `packages/agents/src/search/factory.ts`, and add the kind to `SearchProviderKind` in `packages/types/src/config.ts`.

Either way, `scout config llm add <kind>` / `scout config search add <kind>` on the CLI pick up a new kind automatically once it's in the shared type, no CLI changes needed. The web Settings tab's provider dropdown is a manually-maintained label map (`LLM_KIND_LABELS`/`SEARCH_KIND_LABELS` in `apps/web/app/settings/page.tsx`) keyed by the same enum, so it needs one added entry there too; TypeScript will error on the incomplete `Record` if you forget.

## Adding an import kind

`packages/agents/import-agent.ts` currently only parses OpenAPI/Swagger (URL or raw text) into the shared `Endpoint[]` shape. Postman collections, HAR files, GraphQL introspection, and GitHub repo spec discovery are declared in `packages/types/src/platform.ts`'s `ImportSourceKind` but not implemented; each needs its own extractor producing the same `ImportResult` shape (`name`, `baseUrl`, `authScheme`, `rawSpec`, `endpoints`).

## Working on the core pipeline

The agents (`packages/agents`) depend on an abstract `AgentStore` (`packages/store`), not a concrete database, so they run the same way whether the caller is the CLI, the local viewer's API routes, the MCP server, or (in the dormant hosted mode) `DrizzleAgentStore` over Postgres. If you're changing agent behavior, it should work identically across all of those call sites; the `AgentStore` interface in `packages/store/src/interface.ts` is the contract to preserve.

## Pull requests

- Keep `pnpm typecheck && pnpm lint && pnpm test` green.
- No em dashes in code, comments, docs, or commit messages, house style, sorry.
- Small, focused PRs over large ones. A connector JSON file is a perfect PR by itself.
