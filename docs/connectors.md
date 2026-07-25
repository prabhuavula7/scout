# Connectors

A connector is a JSON preset, not code, mapping a platform slug to a suggested docs URL and default auth scheme. It exists to save you a search for "where's the OpenAPI spec URL," not to gate what Scout can import: the import pipeline is generic and works against any valid OpenAPI/Swagger spec, connector or not, as [examples.md](examples.md) demonstrates.

## Using one

```
scout connectors list
```

shows every bundled preset, its category, and whether it's been verified end-to-end (`implemented: true`, meaning someone actually ran `scout understand` against it and checked the output against the platform's real docs, not just that the JSON parses). 18 are declared today; 2 (Contentful, Bynder) are verified. The rest are real, usable presets, just not yet confirmed by a human against the live platform.

## Adding your own

```json
{
  "slug": "acme",
  "name": "Acme",
  "category": "crm",
  "implemented": true,
  "suggestedDocsUrl": "https://developers.acme.com/",
  "defaultAuthScheme": "bearer_token",
  "description": "Acme's CRM API."
}
```

```
scout connectors add acme.json
```

drops it into `~/.scout/connectors/`, which overrides a bundled preset by slug or adds a new one. Only mark `implemented: true` once you've actually run `scout understand` against the platform and checked the output.

## Contributing one upstream

Bundled connectors live in `packages/connectors/registry/*.json`. To contribute one:

1. Run `scout understand` against the platform's real spec and docs.
2. Check the generated understanding against the platform's actual documentation, not just that Scout produced something.
3. Open a PR adding the JSON file, with `implemented: true` only if you completed step 2.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full workflow.
