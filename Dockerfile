# Builds and runs Scout without needing Node/pnpm installed locally:
#   docker compose up
# See docker-compose.yml and the README's "Run with Docker" section.
#
# Debian-based (not alpine): a couple of this repo's build-time deps
# (lightningcss, for Tailwind v4) ship native bindings that are more
# reliably prebuilt for glibc than musl, matching Next.js's own official
# Docker guidance.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# python3 + build-essential: a couple of transitive deps (e.g.
# msgpackr-extract, pulled in via @modelcontextprotocol/sdk) try to compile
# an optional native accelerator via node-gyp and fall back to a pure-JS
# implementation if that fails; installing these avoids the fallback (and
# the noisy gyp error output) rather than relying on it silently working.
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Install once with the full workspace manifest before copying source, so
# this layer only invalidates when dependencies actually change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# Full default pipeline: builds @scout/web (bundled into @dotapk7/scoutcli's dist/viewer)
# then @dotapk7/scoutcli itself. Same command CONTRIBUTING.md has contributors run.
RUN pnpm build

# ---- runtime: just the published CLI package's own footprint ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Real npm dependencies only (next/react/openai/@anthropic-ai/sdk/etc, see
# packages/cli/tsup.config.ts's comments on why these can't stay bundled);
# same install a real `npm install -g @dotapk7/scoutcli` would do. devDependencies
# still lists workspace:* references (meaningless outside the pnpm
# workspace this was built from); a real registry install never looks at
# devDependencies at all, but `npm install` run locally against this
# package.json parses the whole file even with --omit=dev, so the
# unresolvable "workspace:" protocol has to be stripped first.
COPY --from=builder /app/packages/cli/package.json ./package.json
RUN node -e "const p = require('./package.json'); delete p.devDependencies; require('fs').writeFileSync('./package.json', JSON.stringify(p, null, 2));"
RUN npm install --omit=dev

COPY --from=builder /app/packages/cli/dist ./dist

# So `docker compose exec scout scout <command>` works exactly as documented
# in the README, not just `node dist/index.js <command>`.
RUN chmod +x ./dist/index.js && ln -s /app/dist/index.js /usr/local/bin/scout

# ~/.scout (runs, config, connector overrides) persisted via the compose
# volume; SCOUT_HOME points it here instead of a container-ephemeral home
# dir. 0.0.0.0 so the port mapping below can actually reach the server (see
# `scout serve --help`: it binds 127.0.0.1 only by default everywhere else).
ENV SCOUT_HOME=/data
ENV SCOUT_SERVE_HOST=0.0.0.0
VOLUME ["/data"]

EXPOSE 4207
ENTRYPOINT ["node", "dist/index.js"]
CMD ["serve"]
