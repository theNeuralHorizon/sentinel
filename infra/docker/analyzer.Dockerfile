# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY tsconfig.json ./
COPY packages/ ./packages/
COPY apps/api/package.json ./apps/api/
COPY apps/analyzer/package.json ./apps/analyzer/
COPY apps/cli/package.json ./apps/cli/
COPY apps/web/package.json ./apps/web/
RUN bun install --no-save

FROM oven/bun:1.3-alpine AS runtime
RUN apk add --no-cache tini ca-certificates \
 && adduser -D -u 10001 sentinel
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/tsconfig.json ./tsconfig.json
COPY --from=deps /app/packages ./packages
COPY apps/analyzer ./apps/analyzer
USER sentinel
ENV NODE_ENV=production
EXPOSE 4200
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "apps/analyzer/src/index.ts"]
