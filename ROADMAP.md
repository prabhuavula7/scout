# Roadmap

Integration Scout ships with two connectors fully wired end-to-end
(**Contentful** and **Bynder**, via user-supplied OpenAPI/Swagger source +
docs URLs) so the core loop (import, crawl, understand, chat) is real, not
mocked. This file tracks what's intentionally not built yet, so it's never
confused with something that silently doesn't work.

## Implemented

- Import: OpenAPI URL, raw OpenAPI/Swagger JSON or YAML
- Documentation Intelligence: fetch → HTML-to-markdown → semantic chunking →
  embeddings → pgvector storage
- API Explorer: grouped endpoints, parameters, generated cURL/TypeScript/Python
- AI Understanding: summary, architecture, auth flow, data model, entity
  relationships, workflows, pitfalls, missing docs, security notes, Mermaid
  diagrams, all grounded in the imported spec + crawled docs
- AI Chat: hybrid (vector + full-text) retrieval, citation-grounded answers
- Agent framework: retry with backoff, `agent_runs` audit trail per step
- Connector registry: 18 target platforms declared (CMS/DAM/workflow/
  knowledge/storage/CRM/communication), 2 implemented

## Not yet implemented (by design, not oversight)

- **Additional import kinds**: GraphQL introspection, GitHub repo spec
  discovery, Postman collection, HAR file. The `ImportRequest` type and
  `ImportResult` shape already support them; `import-agent.ts` throws a clear
  "not implemented" error rather than faking output.
- **Schema Mapper**: source→destination field/type/enum mapping with
  confidence scores, now unblocked since Contentful and Bynder are both
  ready platforms to map between.
- **SDK Generator**: full generated SDK packages (retry logic, pagination
  helpers, typed clients) beyond the inline code samples in the Explorer.
- **Integration Planner**: natural-language "sync X with Y" → architecture +
  sequence diagram + failure handling. Depends on Schema Mapper.
- **Additional connectors**: Sanity, WordPress, AEM, Cloudinary,
  Cloudflare Images, Jira, Asana, Monday, Notion, Confluence, Google Drive,
  SharePoint, Dropbox, HubSpot, Salesforce, Slack: declared in
  `packages/connectors/src/registry.ts` with `implemented: false`.
- **Export** (Markdown/PDF/JSON/ZIP) of the generated blueprint.
- **Recursive documentation crawling**: today the Documentation Agent
  crawls an explicit list of URLs; a real spider needs scope rules, rate
  limiting, and sitemap discovery to be safe to run against arbitrary docs
  sites.
- **Command palette, keyboard shortcuts, activity feed, search/favorites
  polish** on the workspace shell.
- **Vitest/Playwright suites**: not yet written for this milestone's code.

## Suggested build order

Ordered around the highest-value scenario for someone evaluating this as a
content-ops / martech orchestration platform: two content systems (a CMS and
a DAM) that a real marketing org would actually need synchronized, not an
arbitrary pair of connectors.

1. ~~Wire up Bynder (DAM) as the second connector.~~ Done. Proves the
   registry pattern generalizes beyond one platform, and pairs with
   Contentful for a realistic "keep assets and content in sync" scenario
   rather than two unrelated systems.
2. Schema Mapper (Contentful ⇄ Bynder field/asset-reference mapping with
   confidence scores): the reusable "adapter/configuration layer" piece.
   This is what actually generalizes to onboarding the next customer's stack,
   not just this one pair of platforms.
3. Integration Planner ("keep Contentful entries in sync with Bynder asset
   updates" → architecture + sequence diagram + failure handling): the
   direct payoff of Schema Mapper, turning a mapped schema into an actual
   sync strategy a team could implement.
4. SDK Generator as a standalone package producing a downloadable client.
5. Export pipeline (Markdown/PDF) over the Understanding + Planner output.
