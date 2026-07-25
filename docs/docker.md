# Run with Docker

For anyone who'd rather not install Node/pnpm at all.

```
git clone https://github.com/prabhuavula7/scout.git
cd scout
docker compose up
```

Open `http://localhost:4207`, the same web app a native `scout serve` gives you: Runs, New, AI Chat, API Explorer, Settings. Runs and provider config persist in a named Docker volume (`scout-data`, mounted at `/data` inside the container) across restarts and rebuilds.

## Skip the Settings tab

Set provider keys as environment variables before starting, and the container picks them up automatically:

```
OPENAI_API_KEY=sk-... TAVILY_API_KEY=tvly-... docker compose up
```

or put them in a `.env` file next to `docker-compose.yml`; Compose reads it automatically. Everything else about provider configuration in the [quickstart](quickstart.md) applies the same way once the container has your keys.

## CLI commands through the container

The web app and CLI both read the same `/data` volume, so CLI commands work identically:

```
docker compose exec scout scout understand https://petstore3.swagger.io/api/v3/openapi.json --docs https://example.com/docs
docker compose exec scout scout list
docker compose exec scout scout chat petstore-openapi-3-0
```

## Rebuilding

```
docker compose up --build
```

after pulling new commits rebuilds the image from source. There's no published image on Docker Hub/GHCR yet, `build: .` in `docker-compose.yml` always builds locally.
