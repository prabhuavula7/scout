# Generated code

Two commands turn a stored blueprint into something you can actually run or hand off, `scout generate` and `scout handoff`. Both share the exact same underlying code generator, so the script embedded in a handoff brief is never different from the one `scout generate` produces on its own.

## `scout generate`

```
scout generate <slug> --lang ts|py [--workflow <name>] [--out <path>] [--list-workflows]
```

Produces a runnable starter script: the auth handshake, plus one real, working call against a read (GET) endpoint. v1 has real templates for three auth schemes, crossed with TypeScript and Python:

- API key in a header
- Bearer token
- API key as a query parameter

Anything else, OAuth2, Basic auth, no read endpoints available, gets an honest, clearly labeled stub instead of code that looks real but doesn't work. The stub states exactly why: `unsupported-auth-scheme:oauth2`, `no-endpoints-available`, `no-read-endpoint-available`.

Real (non-stub) output is actually syntax-checked before it's returned, `node --check` for TypeScript, `python3 -m py_compile` for Python, so "syntax validated" is a real claim, not a hopeful one. That proves the code parses. It doesn't prove the API call succeeds; nothing here has been executed against a live API.

Field names pulled from the real response schema are normalized into valid identifiers. Required path parameters become explicit placeholders you fill in, never invented example values.

`--list-workflows` prints a run's available workflow names so you can target one correctly on the first try. `--out <path>` writes the script to a file (and a sibling `.env.example`, unless one already exists); omit it to print to stdout.

## When the task and the code don't match

v1 only generates real code for GET endpoints. If you target a workflow that needs a write call, `POST /crm/v3/objects/contacts` to create a contact, say, the generated script demonstrates the auth handshake and a basic read call instead, and says so explicitly, in a comment inside the code, a CLI warning, and a banner in the web UI and handoff brief:

```
Warning: the targeted workflow needs a write call, which v1 doesn't generate
real code for yet (GET only). This script demonstrates the auth handshake
and a basic read call instead -- it does NOT implement that workflow.
```

This is the same honesty principle as everything else in Scout: the code that's shown to you is never allowed to silently claim it does something it doesn't.

## `scout handoff`

```
scout handoff <slug> --lang ts|py [--workflow <name>] [--out <path>] [--copy] [--thread <name>]
```

Bundles the task and workflow steps, the auth flow, the exact starter script `scout generate` would produce, its `.env.example`, the specific endpoint used, and the real pitfalls and security observations Scout's synthesis flagged, into one Markdown brief. Paste it into Claude Code, Cursor, or any coding agent as the task prompt, and it has everything it needs to start, without you re-reading the blueprint and hand-assembling the context yourself.

`--copy` sends the brief straight to your system clipboard (`pbcopy` on macOS, `clip` on Windows, `wl-copy`/`xclip`/`xsel` on Linux, whichever your platform actually has) instead of printing it. If no clipboard tool is available, it prints a clear error and falls back to stdout rather than failing silently.

Spec- and LLM-derived text in the brief is sanitized against markdown fence-break injection: a run of three or more backticks embedded in a pitfall or workflow step can't close the document's code fence early and inject content past it, since this brief is designed to be pasted directly into an agentic tool.

### Folding a thread into the brief

`--thread <name>` (the CLI matches by title, creating it if it's genuinely new; the web app's IDE handoff section has a dropdown of existing threads instead; the MCP tool takes `thread` as a title) looks up that thread's message history and makes one extra LLM call to distill it into an "Already figured out in chat" section at the top of the brief, above the Task section: specific endpoints discussed, auth details confirmed, decisions made, workarounds found. Not the raw transcript, a summary, so the brief stays readable instead of dumping a full conversation log into a coding agent's context.

An empty thread, or one that never got past generic Q&A, yields no section at all rather than a padded-out one; there's nothing dishonest about a handoff that just says less when there's less to say.

## Same function, three surfaces

`scout generate` and `scout handoff` are also exposed as `generate_platform` and `handoff_platform` MCP tools, and as a "Starter code" / "IDE handoff" section on the web app's Understanding page. All three call the exact same function. What you see in the terminal is what an MCP-connected agent gets back, is what the web button shows you.

## Auth-scheme coverage, honestly

As of today: API-key header, Bearer token, and API-key query param have real templates. Everything else stubs. This started at two schemes and grew to three after real-world testing against demo runs (Stripe, GitHub, HubSpot) showed the two-scheme version missed HubSpot's query-param auth entirely, so the taxonomy expands based on what's actually blocking real runs, not speculatively. See [ROADMAP.md](../ROADMAP.md) if you want to help expand it further.
