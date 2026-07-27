# MCP reference

`scout mcp` runs a standard stdio MCP server (built on `@modelcontextprotocol/sdk`). Any MCP-speaking coding agent gets the exact same capabilities as the CLI and the web app, structurally, not by convention: every tool here is a thin wrapper around the same agent/store functions `scout <command>` calls, so there's no separate implementation to fall out of sync.

## Why this matters

Without MCP, giving a coding agent real platform knowledge means running `scout understand` yourself, opening the export, and pasting relevant chunks into the agent's chat window. With MCP, the agent calls Scout directly, mid-task: it can import a spec, ask a grounded question, generate a starter script, or assemble a full integration brief, all without you leaving the conversation. A developer in Claude Code can say "integrate Stripe invoicing" and the agent reaches for real, cited platform knowledge instead of its training data.

## Setup

**Claude Code**
```
claude mcp add scout -- scout mcp
```
or in a project's `.mcp.json`:
```json
{ "mcpServers": { "scout": { "command": "scout", "args": ["mcp"] } } }
```

**Claude Desktop** (`claude_desktop_config.json`)
```json
{ "mcpServers": { "scout": { "command": "scout", "args": ["mcp"] } } }
```

**Cursor** (`.cursor/mcp.json`, project or global)
```json
{ "mcpServers": { "scout": { "command": "scout", "args": ["mcp"] } } }
```

**Codex CLI** (`~/.codex/config.toml`)
```toml
[mcp_servers.scout]
command = "scout"
args = ["mcp"]
```

**Gemini CLI** (`~/.gemini/settings.json`, project or global)
```json
{ "mcpServers": { "scout": { "command": "scout", "args": ["mcp"] } } }
```

Running from source instead of a global install? Swap `"scout"` for `"node"` and add the built entry point as the first arg: `"args": ["/path/to/scout/packages/cli/dist/index.js", "mcp"]`.

## The twelve tools

| Tool | What it does |
|---|---|
| `understand_platform` | Import a spec (URL), crawl doc pages, and generate the full understanding. Returns the slug for every other tool. |
| `ask_platform` | Ask a grounded question, scoped to a thread (`thread`, default `main`) so separate conversations about the same platform don't bleed into each other's history, same threads the web app's Threads tab shows. Agentic: a real multi-turn tool-calling loop, not single-shot RAG. Can call `search_docs`, search the live web, generate starter code, or assemble a handoff brief mid-conversation. Every source is tagged `docs` (real similarity score), `web` (URL), or `model_knowledge` (unverified). Pass `slugs` (2+) instead of `slug`, plus `title` to name the conversation, to ask across multiple platforms at once -- `search_docs` merges and tags results by platform, and reusing the same `slugs` + `title` continues that same thread on a later call. |
| `list_platforms` | List every run Scout has already analyzed, with slug and status. |
| `list_connectors` | List known connector presets (see [connectors.md](connectors.md)). |
| `refresh_platform` | Regenerate a run's understanding. Plain refresh re-synthesizes from what's already crawled; `recrawl: true` also re-fetches doc URLs first. |
| `diff_platform` | Drift detection: what changed in a run's understanding since its last refresh. |
| `generate_platform` | Generate a real, syntax-checked starter script (or an honest stub) from a run's blueprint. |
| `handoff_platform` | Assemble a paste-ready integration brief: task, auth, starter code, `.env.example`, and pitfalls, for a coding agent to consume directly. Pass `thread` to fold that thread's conversation in as an LLM-distilled "already figured out in chat" section, so specifics discussed with `ask_platform` aren't left behind. |
| `attach_document_platform` | Attach a local file (path readable from where `scout mcp` runs) or an http(s) link to a run's grounded doc corpus, beyond its crawled docs -- PDF, docx/xlsx/pptx, odt/odp/ods, rtf, csv, md, html, txt, json, yaml, up to 10 MB. Pass exactly one of `filePath` or `url`. |
| `export_platform` | Export the full understanding as Markdown or JSON. |
| `research_platform` | Find related articles, tutorials, and real-world use cases via a configured web search provider. |
| `remove_platform` | Delete a run and everything under it. Requires `confirm: true`, since it's irreversible. |

## A real agent workflow

A developer working in Claude Code, with Scout already added as an MCP server:

1. "Import the Stripe API and tell me how subscriptions work." → `understand_platform` runs the full pipeline, `ask_platform` answers with real citations from the crawled docs.
2. "Give me a starter script for creating a subscription." → `generate_platform` returns real, syntax-checked TypeScript, or an honest stub if the workflow needs a write call Scout doesn't support yet.
3. "Prep a handoff brief for the invoicing workflow, and fold in what we just discussed." → `handoff_platform` with `thread` set returns one Markdown document: task, auth, code, pitfalls, and an LLM-distilled summary of what step 1's conversation actually confirmed, ready for the agent to implement against directly.
4. Three weeks later: "Has anything changed since we last looked at this?" → `diff_platform` reports exactly what's different, no re-reading required.
5. "Now that Stripe's imported, how would it talk to the HubSpot integration we already have?" → `ask_platform` with `slugs: ["stripe", "hubspot-contacts"]` and a `title` merges and cites real excerpts from both platforms' crawled docs in one answer.

None of this requires the developer to run a single `scout` command by hand. The agent drives the whole pipeline through MCP.

## Verifying your setup

```
scout mcp
```
starts the server directly on stdio; it won't print anything and will look like it's hanging, that's expected, it's waiting for JSON-RPC on stdin. Ctrl-C to exit. To confirm your agent sees it, ask it to list available tools, or check its own MCP logs (Claude Desktop writes one per server under its app support directory).
