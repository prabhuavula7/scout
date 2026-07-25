# Real examples

Three platforms below were actually run against their real, public OpenAPI specs and live docs, the output is real Scout output, not illustrative copy. A "try it yourself" list follows with more public specs, verified reachable, that you can run the same way.

## Stripe

```
scout understand https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json --docs https://docs.stripe.com
```

Real output, `scout chat stripe`, "How do I authenticate with the Stripe API?":

> All API calls must use HTTPS and must be authenticated with Stripe API keys. For v1 examples, the secret key is supplied through HTTP Basic authentication as the username, with an empty password... Test mode secret keys start with `sk_test_` and have unrestricted access to their sandboxes. Live restricted keys start with `rk_live_`... [1] [2] [3] [4]

Four real citations, straight from the crawled Stripe docs. When `scout generate stripe --lang ts` is run, it correctly refuses to fabricate code: Stripe's real scheme is HTTP Basic, which v1's codegen doesn't template yet, so it returns a clearly labeled stub instead of code that looks like it works but doesn't.

## HubSpot (Contacts)

```
scout understand <hubspot-contacts-openapi-url> --docs https://developers.hubspot.com/docs/api/crm/contacts
```

HubSpot's Contacts API uses an `api_key_query` auth scheme, one of the three v1 supports with a real template. `scout generate hubspot-contacts --lang ts` produces real, `node --check`-validated TypeScript:

```ts
const apiKey = process.env.HUBSPOT_CONTACTS_API_KEY;
if (!apiKey) {
  throw new Error("Set HUBSPOT_CONTACTS_API_KEY before running this script.");
}
async function main() {
  let url = "https://api.hubapi.com/crm/v3/objects/contacts";
  url += (url.includes("?") ? "&" : "?") + `api_key=${apiKey}`;
  const response = await fetch(url, { method: "GET" });
  // ...
}
```

The synthesized blueprint's "Known pitfalls" section pulled 25+ real, specific constraints straight from HubSpot's docs, not generic advice: batch operations capped at 100 records, idempotency keys pruned after 24 hours, `lifecyclestage` can only move forward unless explicitly cleared, additional emails must be globally unique. None of that is inferred, it's cited from the actual crawled pages.

Ask it to build the "Create a single contact" workflow (a `POST`) and it's honest about the mismatch: v1's codegen only produces real code for reads, so it shows the auth handshake and a basic `GET` call with an explicit warning that this isn't the create workflow, instead of quietly showing unrelated code next to a task description that doesn't match it.

## GitHub (REST API)

```
scout understand https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json --docs https://docs.github.com/en/rest
```

GitHub's public REST endpoints declare a `none` auth scheme (unauthenticated access, rate-limited), distinct from the token-gated ones. Scout's synthesis correctly separated the two rather than assuming every endpoint needs a token, and `scout generate` stubs honestly rather than guessing a default authentication header GitHub never asked for.

## Try it yourself

Public OpenAPI specs, verified reachable, that work the same way:

```
scout understand https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json --docs https://www.twilio.com/docs/usage/api
scout understand https://api.apis.guru/v2/specs/digitalocean.com/2.0/openapi.yaml --docs https://docs.digitalocean.com/reference/api/
scout understand https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json --docs https://api.slack.com/web
```

Any platform with a published OpenAPI/Swagger spec works the same way, this is the generic pipeline, not a per-platform integration. If you run one of these and it's the first real verification against that platform, consider [contributing a connector preset](connectors.md) so the next person doesn't have to find the spec URL themselves.
