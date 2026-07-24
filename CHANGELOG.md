# Changelog

All notable changes to Scout are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-07-24

### Fixed

- Documentation crawling no longer aborts an entire run when a single discovered link 404s (or any seed URL fails outright); the page is skipped and disclosed via the existing crawl-warning banner instead of failing the whole pipeline. Previously a real-world docs site with even one dead internal link (found only through recursive crawling, not the URL the user actually gave) would fail the run outright even though the user's own seed URL succeeded.
- The run detail page (web app) now polls every 2s until a run reaches a terminal status (`ready`/`failed`), instead of fetching once and never updating again; previously a run that failed after the initial page load would silently keep showing its last-seen in-progress status with no visible failure.
- `GET /api/runs/[slug]` no longer returns the full raw OpenAPI spec on every request (up to several MB for a large real-world API like Stripe); the frontend never used it, and the added 2s polling above made re-shipping it on every request pure waste.
- `scout watch` now reuses the crawl depth/page-cap a run was actually created with, instead of silently falling back to hardcoded defaults on every triggered refresh.

### Added

- Understanding-synthesis scope raised to handle the large majority of real-world API surfaces: endpoint summaries 300 → 750, doc chunks 100 → 200. Default crawl settings also raised (depth 1 → 2, max pages 20 → 50, ceiling 100 → 200) to actually gather enough material to use the higher caps.
- `scout refresh <slug>` (and a "Refresh" / "Recrawl docs" button on every run's page in the web app): regenerates a run's understanding without re-importing the spec. Plain `refresh` re-synthesizes from whatever's already crawled and stored (picks up the raised limits above immediately, no network calls); `--recrawl` also re-fetches the run's doc URLs first (needed when crawl depth/page-cap itself changed). Each run now remembers its own crawl settings so both this and `scout watch` reuse them instead of guessing.
- A staged progress view on the Understanding page (Import spec → Crawl docs → Understand & synthesize) with a spinner and rotating status phrases, shown while a run is actively in progress instead of an indistinguishable "not generated yet" empty state.
- Confirmed (already-working, now covered by an explicit concurrency check) that multiple runs can import/crawl/synthesize at the same time: `scout serve`'s run-creation endpoint was already fire-and-forget per request with no shared queue or lock, and each run lives in its own directory, so this was safe by construction rather than newly added.

## [1.0.0] - 2026-07-23

Initial public release.

### Added

- Core pipeline: import an OpenAPI/Swagger spec (URL, local file, or raw text), crawl documentation, chunk and embed it, synthesize a cited integration blueprint, and chat with grounded, cited answers.
- `scout` CLI: `understand`, `list`, `rm`, `chat`, `export`, `watch`, `research`, `serve`, `connectors`, `config`, `mcp`.
- Local web app (`scout serve`): a sidebar (Runs / New / Settings), a "New" tab that runs the same pipeline as `scout understand` without touching a terminal, live status polling, chat with citations, and a "Find related articles and tutorials" button wired to the same research pipeline as `scout research`.
- Provider-agnostic LLM support: OpenAI, Anthropic, Azure OpenAI, OpenRouter, and a generic OpenAI-compatible adapter covering local/open-source models (Ollama, LM Studio, vLLM, etc). Chat and embedding roles resolve independently, each with its own priority-ordered fallback chain, so e.g. Anthropic can serve chat while OpenAI serves embeddings.
- Provider-agnostic web search: Tavily and SerpApi, same fallback-chain pattern, used by `scout research` and the web app's research button.
- Shared provider config (`~/.scout/config.json`) read/written identically by the CLI (`scout config llm`/`scout config search`) and the web app's Settings tab; a pre-existing single-key config or `OPENAI_API_KEY`/`TAVILY_API_KEY` env vars migrate or fall back automatically.
- Recursive documentation crawling: `--docs-depth` follows same-origin links a bounded number of hops past each `--docs` URL, hard-capped by `--docs-max-pages` regardless of depth.
- Pre-run crawl size estimate (`scout understand` prints one, the web "New" form has a preview button) and detection of suspiciously thin/likely-JS-rendered doc pages, surfaced as a warning rather than silently grounding answers in near-nothing.
- Run failure reasons surfaced in the web UI (previously only visible via the CLI's stderr or `agent-runs.jsonl`), including network-level failures (DNS, connection refused), not just non-2xx HTTP responses.
- Same failure-reason handling extended to chat (a misconfigured/invalid provider key now shows the real error inline instead of an unhandled 500) and the research button (no search provider configured, or the provider itself failing, both show a clear message).
- Understanding-synthesis scope is now disclosed instead of silently capped: endpoint summaries and doc chunks are capped (300 / 100) to bound prompt size and cost, doc-chunk selection samples evenly across every crawled source page instead of biasing toward whichever pages were crawled last, and an amber warning banner (`platform.understandingScopeWarning`) discloses it on the run's page whenever a cap is actually hit.
- A sticky, scroll-spy table of contents on the Understanding page's 12 sections; the sidebar (with the theme toggle) now stays pinned while the page content scrolls, instead of scrolling away with it.
- Custom `error.tsx` / `not-found.tsx` pages for the web app, styled consistently instead of Next.js's generic default error/404 pages.
- Connectors as JSON config (`packages/connectors/registry/*.json`, user overrides in `~/.scout/connectors/`), not code.
- `scout mcp`: MCP server exposing `understand_platform` / `ask_platform` / `list_platforms` for Claude Code, Codex, Gemini CLI, and other MCP-speaking agents. Verified against the standard MCP stdio protocol handshake directly and against a real Claude Code client connection; setup snippets for Claude Code, Claude Desktop, Cursor, and Codex CLI are in the README.
- npm-publish packaging: the connector registry and a prebuilt web app are bundled inside the published `scoutcli` package; `next`/`react`/`react-dom` are real dependencies rather than pnpm workspace links, so `scout serve` runs the same way from a real `npm install -g scoutcli` as it does in the monorepo.
- Docker support: a `Dockerfile` + `docker-compose.yml` for anyone who'd rather not install Node/pnpm at all (`docker compose up`, then `http://localhost:4207`). `scout serve` gained a `--host` flag (defaults to `127.0.0.1` everywhere else; the Docker image sets it to `0.0.0.0` so the container's port mapping actually works) and a real `scout` binary on `PATH` inside the image, so `docker compose exec scout scout <command>` works the same as a native install.
- Automated test suite for the web app (`apps/web`): 46 tests across API route handlers (including the error-handling behavior above) and interactive components (sidebar, Runs list delete flow, New-run form, chat, Understanding page, Settings CRUD), on top of the existing unit test coverage in `packages/store`/`packages/cli`/`packages/connectors`/`packages/agents`.
- Dormant hosted mode (`apps/api` + `apps/workers`, Fastify + Clerk + Postgres/pgvector + BullMQ/Redis), kept working but excluded from the default build/test pipeline, for anyone who wants a multi-user hosted deployment later.
