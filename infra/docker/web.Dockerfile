# syntax=docker/dockerfile:1.7
FROM oven/bun:1.3-alpine AS build
WORKDIR /app
COPY package.json bun.lockb* ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN bun install --frozen-lockfile || bun install
ARG PUBLIC_API_URL=http://localhost:4000
ARG PUBLIC_WS_URL=ws://localhost:4000/ws
ENV VITE_PUBLIC_API_URL=$PUBLIC_API_URL
ENV VITE_PUBLIC_WS_URL=$PUBLIC_WS_URL
WORKDIR /app/apps/web
RUN bun run build

FROM oven/bun:1.3-alpine AS runtime
RUN apk add --no-cache tini && adduser -D -u 10001 sentinel
WORKDIR /app
COPY --from=build /app/apps/web/build /app/build
COPY --from=build /app/apps/web/package.json /app/
COPY --from=build /app/node_modules /app/node_modules
USER sentinel
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "/app/build/index.js"]
