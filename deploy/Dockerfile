# syntax=docker/dockerfile:1
#
# One Dockerfile, three images. The build context is the repo root, which
# stack.yml sets; Dockerfile.dockerignore keeps .env files out.
#
#   tools   full install with dev tools; runs database migrations
#   server  the Hono API (auth, RPC, REST, MCP, Stripe webhook, billing jobs)
#   web     the TanStack Start app (SSR + static client bundle)

ARG BUN_VERSION=1.4.2

FROM oven/bun:${BUN_VERSION}-slim AS source
WORKDIR /app
COPY . .

# Everything, dev dependencies included. The postinstall hook generates the
# typed env modules (src/env.ts) from each .env.schema.
FROM source AS tools
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

# The API's public URL is inlined into the browser bundle, so it's a build arg.
FROM tools AS web-build
ARG VITE_SERVER_URL
RUN cd apps/web \
	&& VITE_SERVER_URL="${VITE_SERVER_URL:?pass the VITE_SERVER_URL build arg}" bun run build

# Runtime dependencies only. Scripts are skipped because varlock (which the
# postinstall hook calls) is a dev dependency at the root, so the generated env
# modules are copied over instead. They must be present and current: varlock
# rewrites them on startup otherwise, and the app runs as a non-root user.
FROM source AS runtime
ENV NODE_ENV=production
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile --production --ignore-scripts
COPY --from=tools /app/apps/server/src/env.ts apps/server/src/env.ts
COPY --from=tools /app/apps/web/src/env.ts apps/web/src/env.ts
USER bun

FROM runtime AS server
WORKDIR /app/apps/server
EXPOSE 3000
CMD ["bun", "run", "src/index.ts"]

FROM runtime AS web
COPY --from=web-build /app/apps/web/dist /app/apps/web/dist
# varlock reads apps/web/.env.schema from the working directory.
WORKDIR /app/apps/web
EXPOSE 3001
CMD ["bun", "run", "/app/deploy/web-server.ts"]
