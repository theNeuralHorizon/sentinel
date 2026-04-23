# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
COPY packages ./packages
COPY apps/analyzer/package.json ./apps/analyzer/
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.3-alpine AS runtime
RUN apk add --no-cache tini ca-certificates && adduser -D -u 10001 sentinel
WORKDIR /app
COPY --from=deps /app /app
COPY apps/analyzer ./apps/analyzer
USER sentinel
ENV NODE_ENV=production
EXPOSE 4200
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "apps/analyzer/src/index.ts"]
