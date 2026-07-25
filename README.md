# Scout

[![CI](https://github.com/prabhuavula7/scout/actions/workflows/ci.yml/badge.svg)](https://github.com/prabhuavula7/scout/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Give Claude Code, Cursor, Codex, and Gemini CLI accurate knowledge of any API before they write a line of integration code.**

Point Scout at a platform's OpenAPI spec and its docs. It crawls the docs, cross-checks them against the spec, and produces a cited, structural understanding: architecture, auth flow, data model, entity relationships, workflows, real pitfalls. Then it hands that understanding to your coding agent through one MCP server, so the agent reasons from what the platform's docs actually say instead of a plausible-sounding guess from training data.

Everything runs on your machine. No account, no hosted backend, no telemetry.

```
npm install -g @dotapk7/scoutcli
```

## Two minutes to a grounded blueprint

```
scout config llm add openai --api-key sk-...
scout understand https://petstore3.swagger.io/api/v3/openapi.json --docs https://example.com/docs
scout chat petstore-openapi-3-0
```

That's it. `scout serve` opens the same thing in a browser if you'd rather not stay in a terminal.

![Scout's understanding of the real Stripe API: summary, architecture, auth flow, and a full table of contents](public/understanding-summary.png)

## The problem

You open a platform's docs to build an integration. Forty tabs in, you still don't know how auth actually works, what the core objects are, or which of six similarly-named endpoints does what you need. You paste a docs URL into Claude Code and ask it to wire up the integration. It writes confident code against an endpoint that doesn't exist, because it's pattern-matching against every payments API it saw in training, not reading this platform's actual docs.

That gap, between what a coding agent assumes and what a platform's docs actually say, is where integrations break. Scout closes it. It reads the OpenAPI spec as ground truth for what the API can do, crawls the docs as ground truth for how it's meant to be used, and cross-checks one against the other. When something isn't evidenced in either, it says so instead of inventing it.

## What you get

- **Understand Stripe, HubSpot, or any OpenAPI-documented platform in minutes**, not the first afternoon of a new integration.
- **Give any MCP-speaking coding agent the same grounded understanding** through `scout mcp`, mid-session, no copy-pasting docs into a chat window.
- **Ask questions and get cited answers**, never an invented endpoint or field.
- **Get a real, syntax-checked starter script**, the auth handshake plus one working call, not pseudocode.
- **Hand your coding agent a paste-ready integration brief**, task, auth, starter code, and known pitfalls in one document.
- **Know the moment a platform's docs change** instead of finding out in production.

## AI agents get it too

`scout mcp` runs a standard stdio MCP server. Add it once and Claude Code, Claude Desktop, Cursor, Codex CLI, and Gemini CLI can all call Scout directly, mid-task, instead of guessing.

**Claude Code**
```
claude mcp add scout -- scout mcp
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`.cursor/mcp.json`)
```json
{ "mcpServers": { "scout": { "command": "scout", "args": ["mcp"] } } }
```

**Codex CLI** (`~/.codex/config.toml`)
```toml
[mcp_servers.scout]
command = "scout"
args = ["mcp"]
```

**Gemini CLI** (`~/.gemini/settings.json`)
```json
{ "mcpServers": { "scout": { "command": "scout", "args": ["mcp"] } } }
```

Eleven tools, the same capabilities as the CLI and web app: import a spec, ask a grounded question, refresh a stale run, check what changed, generate a starter script, assemble an IDE handoff brief, export the blueprint, find further reading, clean up. A developer working in Claude Code can say "integrate Stripe invoicing" and the agent pulls real, cited platform knowledge into its own context instead of hallucinating an API shape. Full reference: [docs/mcp.md](docs/mcp.md).

## AI Chat, grounded and cited

The chat isn't a wrapper around a generic model. It runs a real multi-turn tool-calling loop: it can search the platform's own crawled docs, search the live web if you've configured a provider, generate starter code, or assemble an IDE handoff brief, mid-conversation. Every answer is tagged with where it actually came from: a doc excerpt with a real similarity score, a live web result with a URL, or the model's own general knowledge, flagged unverified rather than given a fake citation.

> **You:** How do I authenticate with the Stripe API?
>
> **Scout:** All API calls must use HTTPS and be authenticated with Stripe API keys. Test mode secret keys start with `sk_test_`... [1] [2] [3] [4]

![AI chat answering a real authentication question with real citations from the crawled Stripe docs](public/ai-chat.png)

Ask it something Scout genuinely can't verify and it says so instead of guessing. Stripe's real auth scheme is HTTP Basic, not Bearer; when a workflow needs a write call Scout's codegen doesn't support yet, it tells you exactly that instead of quietly showing you the wrong thing:

![Scout refusing to fabricate write-call code, showing the real read-call skeleton and an explicit warning instead](public/starter-code.png)

## Generated code, or an honest stub

`scout generate` turns a stored blueprint into a runnable starter script: the auth handshake plus one real, working call, syntax-checked before it's shown to you. When a platform's auth scheme isn't supported yet or the workflow needs a write call, you get a clearly labeled stub and a reason, never fabricated-looking code that quietly does the wrong thing.

`scout handoff` goes one step further: it assembles the task, the auth flow, the starter script, the `.env.example`, and the real pitfalls Scout's synthesis flagged into one Markdown brief you can paste straight into a coding agent as its task prompt, or `--copy` it straight to your clipboard.

![A real IDE handoff brief for HubSpot Contacts: task, auth, starter code, and a sequence diagram, ready to paste into a coding agent](public/ide-handoff.png)

Full reference, including the exact auth schemes supported today: [docs/generated-code.md](docs/generated-code.md).

## Every endpoint, at a glance

The API Explorer lists every endpoint the spec declares, method-color-coded, searchable, no scrolling through YAML.

![API Explorer listing every real Stripe endpoint from the imported spec](public/api-explorer.png)

## Real examples

Three platforms verified end-to-end against their real, public specs and docs this session:

| Platform | Command | What Scout found |
|---|---|---|
| **Stripe** | `scout understand https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json --docs https://docs.stripe.com` | Auth is HTTP Basic, not Bearer, real templates don't cover it yet, so `scout generate` correctly stubs instead of guessing. |
| **HubSpot** (Contacts) | `scout understand <hubspot-openapi-url> --docs https://developers.hubspot.com/docs/api/crm/contacts` | Real, syntax-validated TypeScript for the `api_key_query` auth scheme, plus 25+ real pitfalls (batch limits, idempotency, lifecycle-stage ordering) pulled straight from the docs. |
| **GitHub** (REST API) | `scout understand https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json --docs https://docs.github.com/en/rest` | Correctly identified `none`-scheme public endpoints vs. token-gated ones, and generated an honest stub rather than assuming a default. |

More platforms, full transcripts, and a walkthrough of the honesty behavior: [docs/examples.md](docs/examples.md).

## Core commands

| Command | What it does |
|---|---|
| `scout understand <spec-url-or-path>` | Import a spec, crawl `--docs`, generate the understanding. |
| `scout chat <slug>` | Agentic chat: real tool-calling, cited answers, never a fabricated citation. |
| `scout generate <slug> --lang ts\|py` | A real, syntax-checked starter script, or an honest stub. |
| `scout handoff <slug> --lang ts\|py [--copy]` | A paste-ready integration brief for a coding agent. |
| `scout diff <slug>` | Drift detection: what changed in a run's understanding since its last refresh. |
| `scout refresh <slug> [--recrawl]` | Regenerate the understanding without a full re-import. |
| `scout watch <slug>` | Poll a run's docs and refresh automatically when they change. |
| `scout export <slug> --format md\|json` | Export the blueprint. |
| `scout serve` | The local web app: Runs, New, AI Chat, API Explorer, Settings. |
| `scout mcp` | Run Scout as an MCP server for coding agents. |

Full option list on any command: `scout <command> --help`. Everything else, providers, connectors, Docker, architecture, contributing: [docs/](docs/).

## Documentation

- [Quickstart](docs/quickstart.md), five minutes from install to a grounded chat.
- [Why Scout exists](docs/why-scout.md), the honesty model and why OpenAPI plus docs beats either alone.
- [MCP reference](docs/mcp.md), all eleven tools, every agent's config format.
- [Generated code](docs/generated-code.md), `scout generate` and `scout handoff` in depth.
- [Examples](docs/examples.md), real runs against Stripe, HubSpot, GitHub, and more.
- [Connectors](docs/connectors.md), adding a platform preset.
- [Architecture](docs/architecture.md), package layout and the storage model.
- [Docker](docs/docker.md), running Scout with no local Node install.
- [Development](docs/development.md), building and testing from source.
- [FAQ](docs/faq.md).

See [CHANGELOG.md](CHANGELOG.md) for release notes and [ROADMAP.md](ROADMAP.md) for what's done vs. still open.

## License

MIT, see [LICENSE](LICENSE).
