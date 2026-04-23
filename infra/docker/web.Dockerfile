# syntax=docker/dockerfile:1.7
# SvelteKit 5 dashboard build — adapter-node output served by Bun.

FROM oven/bun:1.3-alpine AS build
WORKDIR /app
# Copy the whole workspace up front so bun install resolves every workspace:*
# reference and lands devDeps (vite, svelte-check, …) in node_modules/.bin.
COPY package.json bun.lock* tsconfig.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
RUN bun install
ARG PUBLIC_API_URL=http://localhost:4000
ARG PUBLIC_WS_URL=ws://localhost:4000/ws
ENV VITE_PUBLIC_API_URL=$PUBLIC_API_URL
ENV VITE_PUBLIC_WS_URL=$PUBLIC_WS_URL
WORKDIR /app/apps/web
RUN bun run build

FROM oven/bun:1.3-alpine AS runtime
RUN apk add --no-cache tini ca-certificates \
 && adduser -D -u 10001 sentinel
WORKDIR /app
COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./
COPY --from=build /app/node_modules ./node_modules
USER sentinel
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "./build/index.js"]
