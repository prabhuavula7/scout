# Why Scout exists

## The real workflow this replaces

You're integrating a new platform. The docs are a hundred pages across a dozen sections. You open them in order, trying to build a mental model before writing a line of code: how does auth actually work, what are the core objects and how do they relate, which of six similarly-named endpoints does what you need, what breaks in practice that the happy-path examples don't mention.

Increasingly, you don't do this alone. You paste a docs URL into Claude Code, Cursor, or Codex and ask it to wire up the integration. The agent writes confident, plausible-looking code, against an endpoint that doesn't exist, with a request shape from a different version of the API, because it's pattern-matching against every payments or CRM API it saw in training. It has no way to tell the difference between "this is how Stripe works" and "this is how most similar APIs work," because it never actually read this platform's real docs.

That gap, between what a coding agent assumes and what a platform's docs actually say, is where integrations break in code review, in staging, or in production.

## Why an OpenAPI spec, not just a docs URL

Prose documentation is optimized for a human skimming it, not for a system that needs ground truth. An OpenAPI/Swagger spec is a machine-readable contract: every endpoint, parameter, schema, and declared auth scheme, structured and unambiguous.

Scout uses the spec as ground truth for what the API can actually do, and the crawled docs as ground truth for how it's meant to be used in practice, the two cross-checked against each other rather than either one trusted alone. A doc page might describe a workflow using an endpoint the spec never declares; the synthesis is instructed to flag that as missing documentation, not paper over it.

## The honesty model

Every part of Scout is built around one constraint: never present a guess as a fact.

- The understanding agent is instructed to say "missing documentation" instead of inventing an endpoint, field, or behavior that isn't evidenced in the spec or the crawled docs.
- `scout generate` produces real, syntax-checked code for the auth schemes it supports today (API-key header, Bearer token, API-key query param). Anything else, OAuth2, no read endpoints, a write-only workflow, gets a clearly labeled stub with a stated reason, never code that looks real but silently does the wrong thing.
- When a workflow needs a write call and the generated script can only demonstrate a read, Scout says so explicitly in the code, the CLI output, and the handoff brief, rather than quietly showing you an unrelated endpoint next to a task description that doesn't match it.
- The agentic chat tags every source: a doc excerpt with its real similarity score, a live web result with its URL, or the model's own general knowledge, flagged unverified, never given a fabricated confidence number.
- A doc page that comes back suspiciously thin (commonly a JS-rendered page a static crawl can't execute) gets a warning banner, not a silently incomplete answer.
- Synthesis itself is capped (endpoint summaries and doc chunks bounded per run, to control prompt size and cost), and a run's page discloses it via a banner whenever a cap was actually hit, instead of quietly looking like a complete blueprint for a platform larger than what was actually analyzed.

This is the difference between a tool that produces a confident-sounding answer and one that produces a correct one, or an honest "I don't know."

## Why agents need this more than humans do

A human reading unfamiliar docs eventually notices when something doesn't add up: an endpoint that isn't where the tutorial said it would be, a field that's missing from the actual response. A coding agent doesn't have that instinct. It generates syntactically valid, confidently-worded code whether or not the API shape it assumed is real.

Feeding an agent a platform's real, cross-checked understanding, through `scout mcp`, closes that gap. The agent stops reasoning from "this looks like every other payments API" and starts reasoning from what this platform's actual spec and docs say. That's a categorically different failure mode: the agent can still make mistakes, but it stops confidently inventing endpoints.

## Who this is for

Engineers who integrate with third-party platforms regularly, not just once: Forward Deployed Engineers, integration engineers, solutions architects, platform and DevEx engineers, and anyone shipping a new API integration who wants their coding agent to get it right the first time. `scout watch` keeps a platform's understanding current as its docs change, and every run is kept, so a platform you looked at last quarter is still there when you come back to it.

## Real-world use cases

- Evaluating a new vendor's API before a build/buy decision.
- Onboarding onto a platform your team just adopted, without reading the entire docs site cover to cover.
- Keeping a living understanding of a platform your team integrates with, refreshed automatically as its docs change.
- Feeding a coding agent real, cited platform knowledge mid-session via `scout mcp`, instead of it guessing from training data.
- Handing a new team member a paste-ready integration brief instead of a wiki page and a Slack thread.
