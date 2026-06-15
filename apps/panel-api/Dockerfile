# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# ReFx Hosting panel-api — multi-stage build
# Build context is expected to be the repo root so the Prisma schema under
# database/prisma is available.
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /repo
# OpenSSL must be present when @prisma/client's postinstall / prisma generate
# runs, so Prisma selects the matching (openssl-3.0.x) query engine — otherwise
# it defaults to openssl-1.1.x and fails to load against the OpenSSL-3 runtime.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY apps/panel-api/package.json apps/panel-api/package.json
COPY database/prisma database/prisma
WORKDIR /repo/apps/panel-api
RUN npm install --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /repo
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /repo/apps/panel-api/node_modules apps/panel-api/node_modules
COPY database/prisma database/prisma
COPY apps/panel-api apps/panel-api
WORKDIR /repo/apps/panel-api
RUN npm run prisma:generate && npm run build

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/panel-api
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /repo/apps/panel-api/node_modules ./node_modules
COPY --from=build /repo/apps/panel-api/dist ./dist
COPY --from=build /repo/database/prisma ../../database/prisma
COPY apps/panel-api/package.json ./package.json
EXPOSE 4000
USER node
CMD ["node", "dist/main.js"]
