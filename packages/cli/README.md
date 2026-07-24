# Scout

**Understand any enterprise platform in minutes.**

Point Scout at a platform's OpenAPI/Swagger spec and its docs, and it produces a cited integration blueprint (architecture, auth flow, data model, common workflows, pitfalls) plus a grounded chat assistant, all running locally on your machine. No account, no server, no hosting.

## Install

```
npm install -g @dotapk7/scoutcli
```

## Quickstart

```
# 1. Add an LLM provider (required once; picks the key up from ~/.scout/config.json after this)
scout config llm add openai --api-key sk-...
#   ...or: anthropic --api-key sk-ant-...  /  azure-openai --base-url <endpoint> --api-key <key>
#   ...or: openai-compatible --base-url http://localhost:11434/v1 --api-key ollama --chat-model llama3.1  (local models: Ollama, LM Studio, vLLM, etc)

# 2. Point it at a spec
scout understand https://petstore3.swagger.io/api/v3/openapi.json --docs https://example.com/docs
scout chat petstore-openapi-3-0
scout serve
```

Prefer a browser to a terminal? Skip straight to `scout serve` and add a provider from the Settings tab instead, no config step needed first.

## Core commands

| Command | What it does |
|---|---|
| `scout understand <spec-url-or-path>` | Import a spec, crawl `--docs`, generate the understanding. `--docs-depth <n>` (default 2) follows same-site links that many hops past each `--docs` URL; `--docs-max-pages <n>` (default 50) caps the total regardless of depth. |
| `scout list` / `scout rm <slug>` | List every run, or delete one and everything under it. |
| `scout chat <slug>` | Terminal chat REPL, grounded in the crawled docs, with citations. |
| `scout refresh <slug> [--recrawl]` | Regenerate a run's understanding without re-importing the spec; `--recrawl` also re-fetches its doc URLs first. |
| `scout diff <slug> [--json]` | Show what changed in a run's understanding since its last refresh: narrative sections that changed, and workflows/data-model entities/pitfalls/integration opportunities added or removed. |
| `scout export <slug> --format md\|json` | Export the understanding as Markdown or JSON. |
| `scout generate <slug> --lang ts\|py [--workflow <name>] [--out <path>]` | Generate a runnable starter script (auth handshake + one real read call) from the blueprint. Falls back to an honest stub, not fabricated code, when the run's auth scheme isn't yet supported (v1: API-key-header, Bearer token, API-key-query) or it has no read endpoints. `--list-workflows` prints available workflow names instead of generating. Real (non-stub) output is syntax-checked (`node --check`/`python3 -m py_compile`) before being returned. |
| `scout watch <slug>` | Poll the run's doc URLs, re-run the pipeline automatically when they change. |
| `scout research <slug>` | Find related articles and tutorials via a configured search provider. |
| `scout serve` | Start the local web viewer at `127.0.0.1` (no login, not reachable from outside the machine by default). |
| `scout config llm add <kind> --api-key <key>` | Add an LLM provider: `openai`, `anthropic`, `azure-openai`, `openrouter`, `openai-compatible`. |
| `scout config search add <kind> --api-key <key>` | Add a web search provider (`tavily`, `serpapi`), used by `scout research`. |
| `scout mcp` | Run Scout as an MCP server (stdio) for Claude Code, Codex, Gemini CLI, and other MCP-speaking agents. |

Run `scout <command> --help` for the full option list on any of these.

## Multiple providers, with fallback

Configure more than one entry for either role and Scout tries them in priority order, falling back automatically if one fails:

```
scout config llm add openai --api-key sk-... --roles chat,embedding
scout config llm add anthropic --api-key sk-ant-... --roles chat --priority 1
```

Everything above is also available as a Settings tab in `scout serve`'s local web viewer; both read and write the same `~/.scout/config.json`.

## Using `scout mcp` with a coding agent

Add to your MCP client's config (Claude Code, Claude Desktop, Cursor, Codex CLI):

```json
{
  "mcpServers": {
    "scout": {
      "command": "scout",
      "args": ["mcp"]
    }
  }
}
```

Exposes the same tasks a human can do via the CLI or `scout serve`, as tools: `understand_platform`, `ask_platform`, `list_platforms`, `list_connectors`, `refresh_platform`, `diff_platform`, `generate_platform`, `export_platform`, `research_platform`, `remove_platform`. An agent can import a spec, chat with citations, refresh a stale run, check what changed, generate a starter script, export a blueprint, find further reading, and clean up, all mid-task instead of a human running the CLI and pasting output back in.

## Learn more

Full docs, screenshots, architecture, Docker instructions, and how to add a connector: **https://github.com/prabhuavula7/scout**

## License

MIT
