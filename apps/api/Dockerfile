# API + queue worker image (OT-011). One image, two commands:
#   API:    node --import ./dist/instrumentation.js dist/main.js   (default)
#   worker: node dist/worker.js
#   release (Fly release_command, before new machines start):
#           node node_modules/@kpi-nexus/db/scripts/release-db.mjs
# Build from the repo root: docker build -f apps/api/Dockerfile .

FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
# Download every package from the lockfile alone, so this layer stays cached
# until dependencies change.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline \
    && pnpm --filter @kpi-nexus/db exec prisma generate \
    && pnpm turbo build --filter=@kpi-nexus/api...
# Runtime tree: the API's production dependencies with workspace packages
# copied in. The Prisma client is generated again inside that tree.
RUN pnpm deploy --filter @kpi-nexus/api --prod /out \
    && cd /out/node_modules/@kpi-nexus/db \
    && node "$(node -p "require.resolve('prisma/build/index.js')")" generate

FROM node:22-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# The deploy passes the commit SHA; GET /health reports it so a deploy can confirm what is live.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER node
EXPOSE 4000
CMD ["node", "--import", "./dist/instrumentation.js", "dist/main.js"]
