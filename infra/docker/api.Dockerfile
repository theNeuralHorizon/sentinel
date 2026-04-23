# syntax=docker/dockerfile:1.7
# Bun runtime image for the API gateway.
# Bun loads TypeScript directly — no build step needed.

FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
# Copy the whole workspace up front so workspace:* references resolve to the
# actual sibling packages and every declared dep lands in node_modules.
COPY package.json bun.lock* tsconfig.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
RUN bun install

FROM oven/bun:1.3-alpine AS runtime
RUN apk add --no-cache tini ca-certificates \
 && adduser -D -u 10001 sentinel
WORKDIR /app
COPY --from=deps /app /app
USER sentinel
ENV NODE_ENV=production
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "apps/api/src/index.ts"]
