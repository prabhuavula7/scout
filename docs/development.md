# Local development

```
pnpm install
pnpm build           # builds everything except the dormant hosted mode
pnpm --filter @dotapk7/scoutcli dev -- understand <spec-url> --docs <docs-url>
pnpm --filter @dotapk7/scoutcli build && node packages/cli/dist/index.js serve
```

`pnpm typecheck` / `pnpm lint` / `pnpm test` cover the default (CLI + local viewer) path, including `apps/web`'s own test suite (API route handlers and interactive components, via Vitest + React Testing Library). `pnpm hosted:build` / `pnpm hosted:dev` cover the dormant hosted mode (`apps/api`, `apps/workers`); see `apps/api/README.md` if you're working on that instead.

## Running the web app directly

```
pnpm --filter @scout/web dev
```

starts the Next.js dev server at `http://localhost:3000` against your real `~/.scout/runs/` data, useful for iterating on UI without rebuilding the CLI's bundled viewer each time.

## Zero-config LLM key while working from source

The real, provider-agnostic config path is `scout config llm add <kind> --api-key <key>` (persists to `~/.scout/config.json`), which is what published-package users are expected to use. When running from source, Scout also falls back to `OPENAI_API_KEY` (and `OPENAI_CHAT_MODEL` / `OPENAI_EMBEDDING_MODEL` / `TAVILY_API_KEY`) directly from your shell environment if nothing's been configured yet -- so `export OPENAI_API_KEY=sk-...` before `pnpm dev` is enough to get started without running `scout config` first. This fallback only covers OpenAI; every other provider (Anthropic, Azure OpenAI, OpenRouter, self-hosted) requires `scout config llm add`.

## Docker as a build sanity check

`docker compose up` builds and runs Scout from source, going through the same `pnpm build` + npm-dependency-resolution path a real `npm publish` would. Useful for catching a packaging regression a local `pnpm build` wouldn't, without installing Node/pnpm at all; see [docker.md](docker.md).

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md), and [connectors.md](connectors.md) if you're adding a platform preset. [CHANGELOG.md](../CHANGELOG.md) has release notes; [ROADMAP.md](../ROADMAP.md) has what's done vs. still open.
