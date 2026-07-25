# Architecture

## Package layout

```
packages/agents       import / documentation / understanding / chat / research agents, provider-agnostic search
packages/ai           provider-agnostic LLM interface (OpenAI, Anthropic, Azure OpenAI, OpenRouter, OpenAI-compatible), including a real multi-turn tool-calling loop
packages/rag          chunking + citation formatting
packages/store        AgentStore contract + LocalFileStore (the CLI's default persistence), shared provider config
packages/connectors    connector presets as JSON (bundled + user-added)
packages/cli           the `scout` binary
apps/web               the local web app (Next.js), served by `scout serve`
```

## The agent pipeline

`scout understand` runs four agents in sequence:

1. **Import** parses the OpenAPI/Swagger spec, extracting every endpoint, parameter, schema, and the declared auth scheme.
2. **Documentation** crawls the doc URLs you point it at, following same-site links breadth-first up to `--docs-depth` hops (default 2) and capped at `--docs-max-pages` (default 50), chunking and embedding the result.
3. **Understanding** asks an LLM to synthesize architecture, auth flow, data model, entity relationships, common workflows, pitfalls, security observations, and missing-documentation gaps, grounded in the spec and the crawled chunks, not the model's training data.
4. **Chat** (on demand) runs a real multi-turn tool-calling loop: search the crawled docs, search the live web if configured, generate starter code, or assemble a handoff brief, mid-conversation, tagging every source with real provenance.

None of these agents know or care where their data is persisted; they depend on an `AgentStore` interface, not a concrete database.

![Real entity relationships synthesized from Stripe's actual OpenAPI spec and docs, rendered as a Mermaid diagram](../public/understanding-entity-diagram.png)

## Storage: local-first by default

`LocalFileStore` (in `packages/store`) is the default `AgentStore` implementation: one directory per run under `~/.scout/runs/<slug>/`, flat JSON files for the current snapshot, append-only JSONL for chat and audit logs, and a `history/` folder of prior understanding snapshots whenever a refresh detects a change (this is also what powers `scout diff`'s drift detection, no separate storage mechanism). Hybrid search (embedding cosine similarity blended with keyword relevance) runs in-memory, no database required.

This is why a run from a month ago and one from five minutes ago show up identically, and why `scout serve` and the CLI can both read and write the same data without a server in between.

## Tool-calling, provider-agnostically

`packages/ai`'s `LLMProvider` interface exposes `completeWithTools`, real multi-turn tool-calling, not a prompt-engineering workaround. Anthropic's native tool-use API and the OpenAI-wire function-calling shape (shared by OpenAI, Azure OpenAI, and any OpenAI-compatible endpoint, Ollama, LM Studio, OpenRouter, vLLM) are both implemented, so the agentic chat works the same way regardless of which provider you've configured. If a configured provider's tool-calling fails outright, Scout falls back to single-shot grounded RAG rather than hard-failing the conversation.

## The dormant hosted mode

`apps/api` and `apps/workers` (Fastify + Clerk auth + Postgres/pgvector + BullMQ/Redis) implement the same `AgentStore` contract over Postgres. They're kept in the repo, working, but excluded from the default build/dev/test pipeline, for anyone who wants a hosted, multi-user deployment later. See `apps/api/README.md`.
