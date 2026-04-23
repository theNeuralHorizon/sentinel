# Contributing to Sentinel

Thanks for being here. Sentinel is young, and PRs for new ecosystem detectors, better prompts, policy presets, and n8n workflows are especially welcome.

## Dev setup

```bash
git clone https://github.com/theNeuralHorizon/sentinel
cd sentinel
cp .env.example .env
docker compose up -d postgres dragonfly nats
bun install
bun run scripts/seed.ts

# Start each service in its own terminal
bun --cwd apps/api dev
bun --cwd apps/analyzer dev
bun --cwd apps/web dev
# Scanner: run via Docker, or `cd apps/scanner && go run ./cmd/scanner`
```

## Repo layout

```
apps/
  api/        # Bun + Hono API gateway
  analyzer/   # Bun + Claude worker
  scanner/    # Go SBOM scanner
  cli/        # Bun CLI (sentinel-cli)
  web/        # SvelteKit 5 dashboard
packages/
  db/         # Drizzle schema + migrations
  shared/     # Zod schemas + risk scoring + licenses + purl
  ai/         # Anthropic SDK wrapper + prompts + embeddings
infra/
  docker/     # Dockerfiles + compose
  k8s/        # Raw Kustomize manifests
  helm/       # Helm chart
  n8n/        # Workflow JSON exports
scripts/      # Seed, maintenance helpers
docs/
```

## Style & testing

- **TypeScript**: strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any` in shipped code.
- **Go**: `go vet` + `go test -race`. No third-party linters forced.
- **Commits**: conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
- **Tests**: every new package function must have a unit test. Integration tests go under each app's `test/` directory.

## Running tests

```bash
bun test                                      # all Bun tests
cd apps/scanner && go test -race ./...        # Go tests
```

## Adding an ecosystem detector

1. Implement `scan.Detector` in `apps/scanner/internal/scan/detectors.go`.
2. Register it in `DefaultDetectors()`.
3. Add a test case in `engine_test.go`.
4. Add the new `Ecosystem` enum value in three places:
   - `apps/scanner/internal/scan/types.go`
   - `packages/shared/src/sbom.ts` (Zod enum)
   - `packages/db/src/schema/components.ts` (pg enum)
   - `packages/db/migrations/` (new migration)
5. Open a PR — CI will block if any of the above are missing.

## License

By contributing you agree your work will be licensed under Apache-2.0.
