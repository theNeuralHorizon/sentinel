# syntax=docker/dockerfile:1.7
# Multi-stage Bun build for the API gateway.

FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ai/package.json ./packages/ai/
COPY apps/api/package.json ./apps/api/
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY packages ./packages
COPY apps/api ./apps/api
COPY tsconfig.json ./
WORKDIR /app/apps/api
RUN bun run build || true

FROM oven/bun:1.3-alpine AS runtime
RUN apk add --no-cache tini ca-certificates && \
    adduser -D -u 10001 sentinel
WORKDIR /app
COPY --from=build /app /app
USER sentinel
ENV NODE_ENV=production
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "apps/api/src/index.ts"]
