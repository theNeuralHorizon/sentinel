# syntax=docker/dockerfile:1.7
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY apps/scanner/go.mod apps/scanner/go.sum* ./apps/scanner/
RUN cd apps/scanner && go mod download || true
COPY apps/scanner ./apps/scanner
WORKDIR /src/apps/scanner
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/scanner ./cmd/scanner

FROM alpine:3.20 AS runtime
RUN apk add --no-cache ca-certificates tini && adduser -D -u 10001 sentinel
WORKDIR /app
COPY --from=build /out/scanner /app/scanner
USER sentinel
EXPOSE 4100
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/scanner"]
