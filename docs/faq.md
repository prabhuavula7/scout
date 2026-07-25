# FAQ

**Does Scout send my data anywhere?**
No hosted backend, no accounts, no telemetry. The only network calls Scout makes are the ones you configure: the platform's spec/docs URLs (to import and crawl), your chosen LLM provider (for synthesis, chat, and embeddings), and your chosen search provider (if you enable `scout research`). Everything else is stored under `~/.scout/` on your machine.

**Why isn't this just ChatGPT with the docs pasted in?**
A generic chat model reasoning over pasted text has no way to tell "this is definitely true" from "this sounds plausible." It'll invent an endpoint that doesn't exist with the same confidence as one that does. Scout cross-checks the OpenAPI spec (a machine-readable contract) against the crawled docs, and is explicitly instructed to say "missing documentation" instead of guessing. The agentic chat also has real tool access, it can re-search the docs mid-conversation, not just reason over whatever fit in one prompt.

**Why isn't this Swagger UI / an OpenAPI viewer?**
Swagger UI renders a spec. It doesn't crawl docs, doesn't synthesize an architecture overview or a data model, doesn't answer questions, doesn't generate starter code, and has no concept of a coding agent calling it via MCP. Scout's primary output is an understanding, a spec viewer is a side effect of already having imported the endpoints.

**Does this cost money to run?**
Scout itself is free and open source. You pay whatever your configured LLM/search provider charges for API usage, same as any tool that calls an LLM. `scout understand` prints a size estimate (endpoints, doc pages, token count) before it starts, and it's local models via Ollama/LM Studio work too if you want zero marginal cost.

**Does it work with local/open-source models?**
Yes. Anything that speaks the OpenAI chat-completions wire protocol works via `scout config llm add openai-compatible --base-url <your-endpoint>`, Ollama, LM Studio, vLLM, or a hosted OpenRouter model. Quality of the synthesized understanding depends on the model, smaller local models will produce thinner results than GPT-4-class or Claude-class models.

**What happens to my API keys?**
Stored in `~/.scout/config.json` on your machine, never printed back by `scout config llm list`, never transmitted anywhere except directly to the provider you configured them for.

**Can multiple people on my team share runs?**
Not today. `LocalFileStore` is single-machine by design, that's the tradeoff for zero backend/zero account. A dormant hosted mode (`apps/api`, `apps/workers`, Postgres-backed, multi-user) exists in the repo for anyone who wants to stand up a shared deployment; see [architecture.md](architecture.md).

**How is this different from asking my coding agent to just read the docs URL itself?**
Most coding agents either can't fetch arbitrary URLs mid-session, or fetch raw HTML/prose with no structure and no cross-check against the actual API contract. `scout mcp` gives the agent a pre-crawled, pre-synthesized, cross-checked understanding as a callable tool, plus the ability to search deeper, generate code, and assemble a handoff brief, all grounded in what was actually imported.

**What if the platform doesn't have a public OpenAPI spec?**
Scout needs one, that's the ground-truth contract the whole honesty model is built on. Many platforms without a public spec still have one they don't advertise (check `/openapi.json`, `/swagger.json`, or their API reference page's "download spec" link). If a platform genuinely has none, Scout isn't the right tool for it yet, see [ROADMAP.md](../ROADMAP.md) for planned import kinds beyond OpenAPI/Swagger.

**Is the generated code safe to run against a live API?**
It's syntax-checked, not execution-tested. "Syntax validated" means it parses; it does not mean the API call succeeds, matches your account's actual permissions, or is safe to run against production data. Treat it as a correct starting point, not a finished integration.
